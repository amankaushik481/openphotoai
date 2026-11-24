/**
 * Local moderation (no API key): nsfwjs image classifier + light text heuristics.
 *
 * Image model: nsfwjs "MobileNetV2Mid" (graph model, 224×224, ~93% accuracy per nsfwjs), the
 * best of the three models bundled in the nsfwjs package that runs on the declared tfjs
 * packages. Its weights ship inside node_modules as base64 UMD bundles; we load them from disk
 * and run them with tfjs-converter on the shared wasm backend. We do not import `nsfwjs/core`
 * (it pulls the 147 MB `@tensorflow/tfjs` umbrella and `buffer`), and nothing is downloaded.
 *
 * Text: the always-on rule filter lives in src/server/safety; here only a cheap high-precision
 * layer (src/providers/safety/text-heuristics.ts). Public-figure detection is not available
 * locally (`detectPublicFigure` is intentionally omitted).
 */
import path from "node:path";
import type { Tensor } from "@tensorflow/tfjs-core";
import type * as TfConverter from "@tensorflow/tfjs-converter";
import type { ModerationProvider, ModerationResult } from "../types";
import { decodeRgb } from "./image-decode";
import { DEFAULT_NSFW_THRESHOLDS, evaluateNsfw, toNsfwScores, type NsfwThresholds } from "./nsfw-policy";
import { packageDir, requireUncached } from "./node-require";
import { evaluateTextHeuristics } from "./text-heuristics";
import { getTfRuntime, runExclusive, type Tf } from "./tf-runtime";

const NSFW_MODEL_DIR = "mobilenet_v2_mid";
const NSFW_INPUT_SIZE = 224;

interface GraphModelJson {
  format?: string;
  generatedBy?: string;
  convertedBy?: string;
  modelTopology: unknown;
  userDefinedMetadata?: { signature?: unknown } & Record<string, unknown>;
  weightsManifest: { paths: string[]; weights: unknown[] }[];
}

interface LoadedNsfw {
  model: TfConverter.GraphModel;
  tf: Tf;
}

let loaded: Promise<LoadedNsfw> | undefined;

/** Directory of nsfwjs' bundled model files (not reachable through its `exports` map). */
export function nsfwModelDir(): string {
  return path.join(packageDir("nsfwjs"), "dist", "models", NSFW_MODEL_DIR);
}

async function loadNsfwModel(): Promise<LoadedNsfw> {
  const { tf, converter } = await getTfRuntime();
  const dir = nsfwModelDir();
  const json = requireUncached<GraphModelJson>(path.join(dir, "model.min.js"));
  if (json.format !== "graph-model") throw new Error(`safety: unexpected nsfw model format "${json.format}"`);
  const chunks: Buffer[] = [];
  const weightSpecs: unknown[] = [];
  for (const group of json.weightsManifest) {
    for (const shard of group.paths) {
      const base64 = requireUncached<string>(path.join(dir, `${shard}.min.js`));
      if (typeof base64 !== "string" || base64.length === 0) throw new Error(`safety: empty nsfw weight shard ${shard}`);
      chunks.push(Buffer.from(base64, "base64"));
    }
    weightSpecs.push(...group.weights);
  }
  const joined = Buffer.concat(chunks);
  const artifacts = {
    modelTopology: json.modelTopology,
    format: json.format,
    generatedBy: json.generatedBy,
    convertedBy: json.convertedBy,
    userDefinedMetadata: json.userDefinedMetadata,
    signature: json.userDefinedMetadata?.signature,
    weightSpecs,
    weightData: joined.buffer.slice(joined.byteOffset, joined.byteOffset + joined.byteLength),
  } as unknown as Parameters<Tf["io"]["fromMemory"]>[0];
  const model = await converter.loadGraphModel(tf.io.fromMemory(artifacts));
  return { model, tf };
}

function getNsfwModel(): Promise<LoadedNsfw> {
  loaded ??= loadNsfwModel().catch((err: unknown) => {
    loaded = undefined;
    throw err;
  });
  return loaded;
}

/** Raw class probabilities in nsfwjs order [Drawing, Hentai, Neutral, Porn, Sexy]. */
export async function classifyNsfw(bytes: Uint8Array): Promise<Float32Array> {
  // Whole image squashed to 224×224 (no crop), as the model was trained; pixels scaled to 0..1.
  const img = await decodeRgb(bytes, { square: NSFW_INPUT_SIZE });
  const { model, tf } = await getNsfwModel();
  return runExclusive(async () => {
    const output = tf.tidy(() => {
      const input = tf.div(tf.tensor4d(img.data, [1, NSFW_INPUT_SIZE, NSFW_INPUT_SIZE, 3], "float32"), 255);
      return model.predict(input) as Tensor;
    });
    try {
      return (await output.data()) as Float32Array;
    } finally {
      output.dispose();
    }
  });
}

export interface LocalModerationOptions {
  /** Stricter image thresholds. Values above the defaults are clamped: a deployment can only tighten. */
  thresholds?: Partial<NsfwThresholds>;
}

/** Merge overrides into the defaults, never loosening any of them. */
export function strictThresholds(overrides: Partial<NsfwThresholds> = {}): NsfwThresholds {
  const pick = (key: keyof NsfwThresholds) => {
    const v = overrides[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0
      ? Math.min(v, DEFAULT_NSFW_THRESHOLDS[key])
      : DEFAULT_NSFW_THRESHOLDS[key];
  };
  return { explicit: pick("explicit"), suggestive: pick("suggestive"), combined: pick("combined") };
}

export function createLocalModerationProvider(opts: LocalModerationOptions = {}): ModerationProvider {
  const thresholds = strictThresholds(opts.thresholds);
  return {
    name: "local",
    async checkText(text: string): Promise<ModerationResult> {
      const r = evaluateTextHeuristics(text);
      return r.allowed
        ? { allowed: true, categories: [], provider: "local" }
        : { allowed: false, categories: r.categories, provider: "local", reason: `matched: ${r.matches.join(", ")}` };
    },
    async checkImage(bytes: Uint8Array): Promise<ModerationResult> {
      const probabilities = await classifyNsfw(bytes);
      const decision = evaluateNsfw(toNsfwScores(probabilities), thresholds);
      return { ...decision, provider: "local" };
    },
  };
}

/** Pre-load the classifier so the first request does not pay the init cost. */
export async function warmupLocalModerationProvider(): Promise<void> {
  await getNsfwModel();
}
