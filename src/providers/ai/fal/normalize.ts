/**
 * fal result/status normalization. Output shapes differ per endpoint, so normalization is shape-based and
 * works for queue results and webhook payloads alike:
 *   images[] (flux-lora, inpainting, nano-banana, crystal, fashn) · image (codeformer, birefnet)
 *   video (kling i2v, ai-avatar) · audio (minimax tts) · diffusers_lora_file (training) · output (llm)
 */
import type { QueueStatus, RequestLog } from "@fal-ai/client";
import type { ProviderImage, ProviderJobStatus, ProviderOutput } from "@/providers/types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** fal file objects default `content_type` to the string "null". */
const mime = (v: unknown): string | undefined => (typeof v === "string" && v && v !== "null" ? v : undefined);

function toImage(v: unknown): ProviderImage | null {
  if (!isObj(v) || typeof v.url !== "string" || !v.url) return null;
  const img: ProviderImage = { url: v.url };
  const width = num(v.width);
  const height = num(v.height);
  const contentType = mime(v.content_type);
  if (width !== undefined) img.width = width;
  if (height !== undefined) img.height = height;
  if (contentType) img.contentType = contentType;
  return img;
}

export function normalizeFalOutput(data: unknown): ProviderOutput {
  const out: ProviderOutput = { raw: data };
  if (!isObj(data)) return out;

  const seed = num(data.seed);
  if (seed !== undefined) out.seed = seed;

  const images: ProviderImage[] = [];
  if (Array.isArray(data.images)) {
    const flags = Array.isArray(data.has_nsfw_concepts) ? data.has_nsfw_concepts : [];
    data.images.forEach((raw, i) => {
      const img = toImage(raw);
      if (!img) return;
      if (typeof flags[i] === "boolean") img.nsfw = flags[i] as boolean;
      images.push(img);
    });
  } else if (isObj(data.image)) {
    const img = toImage(data.image);
    if (img) images.push(img);
  }
  // One seed describes a whole batch; it only identifies an image when there is exactly one.
  if (images.length === 1 && seed !== undefined) images[0]!.seed = seed;
  if (images.length || Array.isArray(data.images)) out.images = images;

  if (isObj(data.video) && typeof data.video.url === "string") {
    const durationSec = num(data.duration);
    const contentType = mime(data.video.content_type);
    out.videos = [
      { url: data.video.url, ...(durationSec !== undefined ? { durationSec } : {}), ...(contentType ? { contentType } : {}) },
    ];
  }

  if (isObj(data.audio) && typeof data.audio.url === "string") {
    const ms = num(data.duration_ms);
    out.audio = [{ url: data.audio.url, ...(ms !== undefined ? { durationSec: ms / 1000 } : {}) }];
  }

  if (isObj(data.diffusers_lora_file) && typeof data.diffusers_lora_file.url === "string") {
    out.modelRef = data.diffusers_lora_file.url;
  }

  if (typeof data.output === "string") out.text = data.output;
  return out;
}

/**
 * Final status for a completed result. An image endpoint that returns zero images was refused by the
 * provider's own filter (Nano Banana does this instead of returning black images).
 */
export function completedStatus(data: unknown): ProviderJobStatus {
  const output = normalizeFalOutput(data);
  const nothing = !output.images?.length && !output.videos?.length && !output.audio?.length && !output.modelRef && output.text === undefined;
  if (nothing) {
    const reason = isObj(data) && typeof data.description === "string" && data.description.trim() ? ` ${data.description.trim().slice(0, 300)}` : "";
    return {
      state: "failed",
      error: `The provider returned no output (it was most likely refused by the provider's safety filter).${reason}`,
      retryable: false,
    };
  }
  return { state: "succeeded", output };
}

const MAX_LOG_LINES = 20;

/** IN_QUEUE / IN_PROGRESS -> queued / running. COMPLETED is handled by the caller (needs the result). */
export function pendingStatus(st: QueueStatus): ProviderJobStatus | null {
  if (st.status === "IN_QUEUE") return { state: "queued", position: num(st.queue_position) };
  if (st.status === "IN_PROGRESS") {
    const logs = (st.logs ?? []).map((l: RequestLog) => l.message).filter((m) => typeof m === "string");
    const progress = progressFromLogs(logs);
    return {
      state: "running",
      ...(progress !== undefined ? { progress } : {}),
      ...(logs.length ? { logs: logs.slice(-MAX_LOG_LINES) } : {}),
    };
  }
  return null;
}

/** Latest progress (0-100) from tqdm-style lines such as " 45%|####   | 450/1000" or "step 14/28". */
export function progressFromLogs(logs: string[]): number | undefined {
  for (let i = logs.length - 1; i >= 0; i--) {
    const line = logs[i]!;
    const pct = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
    if (pct) return clampPct(Number(pct[1]));
    const frac = /\b(\d+)\s*\/\s*(\d+)\b/.exec(line);
    if (frac && Number(frac[2]) > 0) return clampPct((Number(frac[1]) / Number(frac[2])) * 100);
  }
  return undefined;
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** fal's queue status carries `error` (and `error_type`) when a COMPLETED request failed. */
export function completedErrorText(st: QueueStatus): string | null {
  const extra = st as unknown as { error?: unknown; error_type?: unknown };
  if (typeof extra.error === "string" && extra.error.trim()) {
    const type = typeof extra.error_type === "string" && extra.error_type ? ` (${extra.error_type})` : "";
    return `${extra.error.trim().slice(0, 500)}${type}`;
  }
  return null;
}
