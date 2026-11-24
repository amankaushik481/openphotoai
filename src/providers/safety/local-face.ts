/**
 * Local face analysis with @vladmandic/human (wasm backend, in-process, no API key).
 *
 * Models (from node_modules/@vladmandic/human/models): blazeface (detector), facemesh (landmarks →
 * head pose), faceres (age + 1024-d descriptor). Embeddings are L2-normalized, so cosine
 * similarity is a dot product. Everything heavy is loaded lazily on the first `analyze()`.
 * See docs/SAFETY_PROVIDERS.md for accuracy caveats, thresholds and recalibration.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Config, FaceResult, Human } from "@vladmandic/human";
import type { DetectedFace, FaceProvider } from "../types";
import { l2Normalize, radToDeg, round } from "./face-math";
import { decodeRgb } from "./image-decode";
import { packageEntryDir, requireFromApp } from "./node-require";
import { allowModelDir, getTfRuntime, registerFileModelRouter, runExclusive, type Tf } from "./tf-runtime";

/**
 * Cosine similarity (on L2-normalized faceres descriptors) at or above which two faces are
 * treated as the same person. Derived from human's documented match rule (similarity ≥ 0.5)
 * and checked against the sample faces shipped with human — see docs/SAFETY_PROVIDERS.md.
 * Recalibrate with `pnpm exec tsx scripts/calibrate-face.ts <dir>`.
 */
export const LOCAL_FACE_MATCH_THRESHOLD = 0.6;

/** Images are downscaled so the longest side is at most this many pixels before detection. */
export const LOCAL_FACE_MAX_SIDE = 1024;

/** Faces below this detector confidence are not reported. */
const MIN_DETECTION_CONFIDENCE = 0.3;
const MAX_FACES = 20;
const REQUIRED_MODELS = ["blazeface", "facemesh", "faceres"] as const;

interface HumanModule {
  Human: new (config?: Partial<Config>) => Human;
}

interface LoadedHuman {
  human: Human;
  tf: Tf;
}

let loaded: Promise<LoadedHuman> | undefined;

function humanConfig(wasmDir: string, modelsDir: string): Partial<Config> {
  // Still images only: frame caching / skipping (designed for video) is disabled everywhere.
  const config = {
    backend: "wasm",
    wasmPath: wasmDir,
    modelBasePath: pathToFileURL(modelsDir).href + "/",
    debug: false,
    async: false,
    warmup: "none",
    cacheModels: false,
    cacheSensitivity: 0,
    skipAllowed: false,
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: {
        modelPath: "blazeface.json",
        rotation: true,
        maxDetected: MAX_FACES,
        minConfidence: MIN_DETECTION_CONFIDENCE,
        skipFrames: 0,
        skipTime: 0,
        return: false,
      },
      mesh: { enabled: true, modelPath: "facemesh.json" },
      attention: { enabled: false },
      iris: { enabled: false },
      description: { enabled: true, modelPath: "faceres.json", skipFrames: 0, skipTime: 0, minConfidence: 0 },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
      gear: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  };
  return config as unknown as Partial<Config>;
}

async function loadHuman(): Promise<LoadedHuman> {
  const { tf, wasmDir } = await getTfRuntime();
  // human's package "exports" keys lack "./", so the wasm build cannot be imported by subpath:
  // resolve the main entry and load the sibling file by absolute path (docs/MODELS.md §C.1).
  const humanDist = packageEntryDir("@vladmandic/human");
  const modelsDir = path.join(path.dirname(humanDist), "models");
  allowModelDir(modelsDir);
  const { Human: HumanCtor } = requireFromApp<HumanModule>(path.join(humanDist, "human.node-wasm.js"));
  const human = new HumanCtor(humanConfig(wasmDir, modelsDir));
  registerFileModelRouter(human.tf as unknown as Tf); // no-op when human shares our tfjs-core
  await human.load();
  const backend = (human.tf as unknown as Tf).getBackend();
  if (backend !== "wasm") throw new Error(`safety: human initialized backend "${backend}" instead of wasm`);
  const missing = REQUIRED_MODELS.filter((m) => !human.models.loaded().includes(m));
  if (missing.length > 0) throw new Error(`safety: face models failed to load: ${missing.join(", ")}`);
  return { human, tf };
}

/** Singleton loader; a failed load is retried on the next call instead of caching the error. */
function getHuman(): Promise<LoadedHuman> {
  loaded ??= loadHuman().catch((err: unknown) => {
    loaded = undefined;
    throw err;
  });
  return loaded;
}

function toDetectedFace(f: FaceResult, scaleX: number, scaleY: number): DetectedFace {
  // faceres always yields a descriptor when it runs; a face without one means a model fault.
  // Fail closed rather than silently under-counting faces.
  if (!f.embedding || f.embedding.length === 0) throw new Error("safety: face detected without a descriptor");
  const [x, y, w, h] = f.box;
  const angle = f.rotation?.angle;
  return {
    box: {
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY),
      width: Math.round(w * scaleX),
      height: Math.round(h * scaleY),
    },
    confidence: round(Math.max(0, Math.min(1, f.score ?? f.boxScore ?? 0)), 4),
    embedding: l2Normalize(f.embedding),
    age: typeof f.age === "number" && Number.isFinite(f.age) && f.age > 0 ? round(f.age, 1) : undefined,
    yaw: angle ? round(radToDeg(angle.yaw), 1) : undefined,
    pitch: angle ? round(radToDeg(angle.pitch), 1) : undefined,
    roll: angle ? round(radToDeg(angle.roll), 1) : undefined,
  };
}

async function analyzeLocal(bytes: Uint8Array): Promise<{ faces: DetectedFace[]; width: number; height: number }> {
  const img = await decodeRgb(bytes, { maxSide: LOCAL_FACE_MAX_SIDE });
  const { human, tf } = await getHuman();
  const result = await runExclusive(async () => {
    const input = tf.tensor3d(img.data, [img.height, img.width, 3], "int32");
    try {
      return await human.detect(input as never);
    } finally {
      tf.dispose(input);
    }
  });
  if (result.error) throw new Error(`safety: face detection failed: ${result.error}`);
  const scaleX = img.sourceWidth / img.width;
  const scaleY = img.sourceHeight / img.height;
  const faces = result.face
    .map((f) => toDetectedFace(f, scaleX, scaleY))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  return { faces, width: img.sourceWidth, height: img.sourceHeight };
}

/** Faces are returned largest first. Boxes are in the coordinates of the upright source image. */
export function createLocalFaceProvider(): FaceProvider {
  return {
    name: "local",
    matchThreshold: LOCAL_FACE_MATCH_THRESHOLD,
    analyze: analyzeLocal,
  };
}

/** Pre-load models (e.g. from a worker on boot) so the first request does not pay the init cost. */
export async function warmupLocalFaceProvider(): Promise<void> {
  await getHuman();
}
