/**
 * Shared TensorFlow.js runtime for the local safety models (server-only).
 *
 * - One tfjs-core instance with the WebAssembly backend (no native addon, works on Vercel).
 * - Models are read from `file://` URLs inside node_modules through a tfjs IO router, because
 *   Node's `fetch` cannot read `file://` (the router replaces the global-fetch shim used in
 *   docs/MODELS.md and only serves files under registered model directories).
 * - `runExclusive` serializes inference: the wasm backend is single-threaded anyway, and human
 *   keeps per-process detector state that must not interleave between requests.
 *
 * Nothing here runs at import time; everything is initialized on first use.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type * as TfCore from "@tensorflow/tfjs-core";
import type * as TfConverter from "@tensorflow/tfjs-converter";
import { packageDir, requireFromApp } from "./node-require";

export type Tf = typeof TfCore;
export type TfConverterModule = typeof TfConverter;

export interface TfRuntime {
  tf: Tf;
  converter: TfConverterModule;
  /** Directory holding the tfjs-backend-wasm `.wasm` binaries (trailing separator). */
  wasmDir: string;
}

let runtime: Promise<TfRuntime> | undefined;

/** Initialize (once) and return the shared tfjs runtime. A failed init is retried on next call. */
export function getTfRuntime(): Promise<TfRuntime> {
  runtime ??= initRuntime().catch((err: unknown) => {
    runtime = undefined;
    throw err;
  });
  return runtime;
}

async function initRuntime(): Promise<TfRuntime> {
  const tf = requireFromApp<Tf>("@tensorflow/tfjs-core");
  const converter = requireFromApp<TfConverterModule>("@tensorflow/tfjs-converter");
  const wasm = requireFromApp<{ setWasmPaths(prefix: string, usePlatformFetch?: boolean): void }>(
    "@tensorflow/tfjs-backend-wasm",
  );
  const wasmDir = path.join(packageDir("@tensorflow/tfjs-backend-wasm"), "dist") + path.sep;
  registerFileModelRouter(tf);
  // setWasmPaths must precede the first backend initialization; repeating it is harmless.
  wasm.setWasmPaths(wasmDir);
  const ok = await tf.setBackend("wasm");
  if (!ok) throw new Error("safety: failed to initialize the tfjs wasm backend");
  await tf.ready();
  tf.enableProdMode();
  return { tf, converter, wasmDir };
}

/* ───────────────────────── file:// model loading ───────────────────────── */

const allowedModelDirs = new Set<string>();
const routedEngines = new WeakSet<object>();

/** Allow `file://` model loading from `dir` (absolute). */
export function allowModelDir(dir: string): void {
  allowedModelDirs.add(path.resolve(dir) + path.sep);
}

function isAllowedModelFile(file: string): boolean {
  const resolved = path.resolve(file);
  for (const dir of allowedModelDirs) if (resolved.startsWith(dir)) return true;
  return false;
}

/**
 * Register a tfjs load router for `file://…/model.json` URLs on the given tfjs instance.
 * Idempotent per instance (human may carry its own tfjs-core copy in unusual layouts).
 */
export function registerFileModelRouter(tf: Tf): void {
  const engine = tf.engine();
  if (routedEngines.has(engine)) return;
  routedEngines.add(engine);
  // tfjs routers return null for "not mine" although the published type omits it.
  const router = (url: string | string[]): TfCore.io.IOHandler | null => {
    if (typeof url !== "string" || !url.startsWith("file://")) return null;
    const file = fileURLToPath(url);
    if (!isAllowedModelFile(file)) return null;
    return { load: () => loadModelArtifacts(tf, file) };
  };
  tf.io.registerLoadRouter(router as Parameters<Tf["io"]["registerLoadRouter"]>[0]);
}

async function loadModelArtifacts(tf: Tf, modelJsonPath: string): Promise<TfCore.io.ModelArtifacts> {
  const modelJson = JSON.parse(await readFile(modelJsonPath, "utf8")) as TfCore.io.ModelJSON;
  const dir = path.dirname(modelJsonPath);
  return tf.io.getModelArtifactsForJSON(modelJson, async (manifest) => {
    const specs: TfCore.io.WeightsManifestEntry[] = [];
    const chunks: Buffer[] = [];
    for (const group of manifest) {
      for (const rel of group.paths) {
        const file = path.resolve(dir, rel);
        if (!isAllowedModelFile(file)) throw new Error(`safety: refusing to read weights outside model dir: ${rel}`);
        chunks.push(await readFile(file));
      }
      specs.push(...group.weights);
    }
    const joined = Buffer.concat(chunks);
    const weightData = joined.buffer.slice(joined.byteOffset, joined.byteOffset + joined.byteLength) as ArrayBuffer;
    return [specs, weightData];
  });
}

/* ───────────────────────── inference serialization ───────────────────────── */

let queue: Promise<unknown> = Promise.resolve();

/** Run `fn` after every previously queued inference has settled. */
export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(() => fn());
  queue = next.catch(() => undefined);
  return next;
}
