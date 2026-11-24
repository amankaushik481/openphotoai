import { MODELS, type ModelSpec } from "@/config/models";
import type { ProviderJobStatus, ProviderOutput } from "@/providers/types";
import { encodeModelRef } from "./refs";

/** The subset of Prediction / Training JSON we read (API responses and webhook bodies share it). */
export interface ReplicateJobLike {
  id: string;
  status: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  logs?: string | null;
  metrics?: { predict_time?: number; total_time?: number };
  /** Present on training objects. */
  destination?: string;
  urls?: { get?: string };
}

export type OutputKind = "image" | "video" | "audio" | "text" | "training";

const R = MODELS.replicate;
const ids = (...specs: ModelSpec[]) => new Set(specs.flatMap((s) => [s.id, ...(s.alt ?? [])]));
const TRAINING_IDS = ids(R.train);
const VIDEO_IDS = ids(R.imageToVideo, R.talkingVideo);
const AUDIO_IDS = ids(R.tts);
const TEXT_IDS = ids(R.llm, R.nsfw);

/** Which kind of output an endpoint produces. Unknown endpoints (e.g. trained destination models) are image models. */
export function outputKindFor(endpoint: string): OutputKind {
  const model = endpoint.split(":")[0];
  if (TRAINING_IDS.has(model)) return "training";
  if (VIDEO_IDS.has(model)) return "video";
  if (AUDIO_IDS.has(model)) return "audio";
  if (TEXT_IDS.has(model)) return "text";
  return "image";
}

/** Training objects are served from /v1/trainings/<id>; predictions from /v1/predictions/<id>. */
export function isTrainingJob(job: ReplicateJobLike): boolean {
  return typeof job.urls?.get === "string" && /\/trainings\//.test(job.urls.get);
}

const TRANSIENT_ERROR_RE = /timed? ?out|timeout|temporar|unavailable|overloaded|rate limit|out of memory|internal server error|try again/i;

export function normalizeJob(job: ReplicateJobLike, kind: OutputKind): ProviderJobStatus {
  switch (job.status) {
    case "starting":
      return { state: "queued" };
    case "processing": {
      const progress = parseProgress(job.logs);
      const logs = tailLogs(job.logs);
      return { state: "running", ...(progress !== undefined ? { progress } : {}), ...(logs.length ? { logs } : {}) };
    }
    case "succeeded":
      return succeeded(job, kind);
    case "failed": {
      const error = errorMessage(job.error) ?? "Replicate job failed";
      return { state: "failed", error, retryable: TRANSIENT_ERROR_RE.test(error) };
    }
    case "canceled":
    case "aborted":
      return { state: "canceled" };
    default:
      return { state: "queued" };
  }
}

function succeeded(job: ReplicateJobLike, kind: OutputKind): ProviderJobStatus {
  const raw = { id: job.id, status: job.status, output: job.output, metrics: job.metrics };
  const seed = inputSeed(job.input);

  if (kind === "training") {
    const modelRef = trainingModelRef(job);
    return modelRef
      ? { state: "succeeded", output: { modelRef, raw } }
      : { state: "failed", error: "Training finished without a model version or weights", retryable: false };
  }
  if (kind === "text") {
    return { state: "succeeded", output: { text: outputText(job.output), raw } };
  }

  const urls = collectUrls(job.output);
  if (urls.length === 0) return { state: "failed", error: "Replicate returned no output files", retryable: true };
  const output: ProviderOutput = { raw };
  if (kind === "video") output.videos = urls.map((url) => withType({ url }, url));
  else if (kind === "audio") output.audio = urls.map((url) => ({ url }));
  else {
    // A seed identifies a single image exactly; batches share one seed, so only the job carries it.
    const perImageSeed = urls.length === 1 ? seed : undefined;
    output.images = urls.map((url) => withType(perImageSeed !== undefined ? { url, seed: perImageSeed } : { url }, url));
    if (seed !== undefined) output.seed = seed;
  }
  return { state: "succeeded", output };
}

/** Combines the statuses of a prediction group into one job status. */
export function combineStatuses(statuses: ProviderJobStatus[]): ProviderJobStatus {
  const failed = statuses.find((s) => s.state === "failed");
  if (failed) return failed;
  if (statuses.some((s) => s.state === "canceled")) return { state: "canceled" };
  if (statuses.every((s) => s.state === "succeeded")) {
    const outputs = statuses.map((s) => (s.state === "succeeded" ? s.output : {}));
    const merged: ProviderOutput = { raw: outputs.map((o) => o.raw) };
    const images = outputs.flatMap((o) => o.images ?? []);
    const videos = outputs.flatMap((o) => o.videos ?? []);
    const audio = outputs.flatMap((o) => o.audio ?? []);
    if (images.length) merged.images = images;
    if (videos.length) merged.videos = videos;
    if (audio.length) merged.audio = audio;
    const seed = outputs.find((o) => o.seed !== undefined)?.seed;
    if (seed !== undefined) merged.seed = seed;
    return { state: "succeeded", output: merged };
  }
  if (statuses.every((s) => s.state === "queued")) return { state: "queued" };
  const done = statuses.filter((s) => s.state === "succeeded").length;
  const partial = statuses.reduce((sum, s) => sum + (s.state === "running" ? (s.progress ?? 0) / 100 : 0), 0);
  return { state: "running", progress: Math.round(((done + partial) / statuses.length) * 100) };
}

/** Collects every output file URL from a string | string[] | object output, in order. */
export function collectUrls(output: unknown): string[] {
  const urls: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      if (/^(https:\/\/|data:)/.test(value)) urls.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(output);
  return urls;
}

export function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.filter((c) => typeof c === "string").join("");
  if (output == null) return "";
  return JSON.stringify(output);
}

function trainingModelRef(job: ReplicateJobLike): string | null {
  const out = (job.output ?? {}) as { version?: unknown; weights?: unknown };
  const weights = typeof out.weights === "string" && out.weights.startsWith("https://") ? out.weights : undefined;
  let model: string | undefined;
  let version: string | undefined;
  if (typeof out.version === "string") {
    const colon = out.version.lastIndexOf(":");
    if (colon > 0) {
      model = out.version.slice(0, colon);
      version = out.version.slice(colon + 1);
    } else if (job.destination) {
      model = job.destination;
      version = out.version;
    }
  }
  if (!(model && version) && !weights) return null;
  return encodeModelRef({ model, version, weights });
}

/** tqdm-style progress ("76%|███   | 7568/10000 [...]") or "step 120/1000", as an integer percentage. */
export function parseProgress(logs: string | null | undefined): number | undefined {
  if (!logs) return undefined;
  const lines = logs.split("\n").reverse();
  for (const line of lines) {
    const tqdm = /^\s*(\d+)%\s*\|.+?\|\s*(\d+)\/(\d+)/.exec(line);
    if (tqdm) return clampPercent(Number(tqdm[1]));
    const step = /\bsteps?\s*[:=]?\s*(\d+)\s*\/\s*(\d+)/i.exec(line);
    if (step && Number(step[2]) > 0) return clampPercent((Number(step[1]) / Number(step[2])) * 100);
  }
  return undefined;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tailLogs(logs: string | null | undefined, max = 10): string[] {
  if (!logs) return [];
  return logs
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-max);
}

function errorMessage(error: unknown): string | undefined {
  if (error == null || error === "") return undefined;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail;
  return JSON.stringify(error);
}

function inputSeed(input: unknown): number | undefined {
  if (!input || typeof input !== "object" || !("seed" in input)) return undefined;
  const seed = (input as { seed?: unknown }).seed;
  return typeof seed === "number" && Number.isFinite(seed) ? seed : undefined;
}

const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

/** Best-effort MIME type from a URL's extension or data: prefix. */
export function contentTypeFromUrl(url: string): string | undefined {
  if (url.startsWith("data:")) return /^data:([^;,]+)/.exec(url)?.[1];
  try {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
    return ext ? EXT_TYPES[ext] : undefined;
  } catch {
    return undefined;
  }
}

function withType<T extends { url: string }>(item: T, url: string): T & { contentType?: string } {
  const contentType = contentTypeFromUrl(url);
  return contentType ? { ...item, contentType } : item;
}
