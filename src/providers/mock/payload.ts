/**
 * Mock AI request ids and output URLs carry everything needed to answer getStatus() and
 * fetchOutput() in any process (web, worker, cron): a compact JSON payload, base64url-encoded.
 *
 *   requestId  mock_<submitTimeMs>_<kind>_<payload>
 *   image URL  mock://image/<payload>/<index>
 *   video URL  mock://video/<payload>/<index>
 */
import { z } from "zod";
import { ASPECT_RATIOS, type AspectRatio } from "@/types/domain";

export const MOCK_KINDS = [
  "gen",
  "edit",
  "pose",
  "multi",
  "inpaint",
  "upscale",
  "restore",
  "rmbg",
  "tryon",
  "train",
  "i2v",
  "talk",
] as const;
export type MockKind = (typeof MOCK_KINDS)[number];

/**
 * Prompt directives → payload flag bits. `[mock:unsafe-output]` = `[mock:nsfw-output]`, spelled so
 * that it passes the always-on prompt filter (which blocks the word "nsfw"): use it in full-stack
 * runs (dev, e2e) to reach the output classifier.
 */
export const MOCK_DIRECTIVES = {
  "[mock:fail]": 1,
  "[mock:nsfw-output]": 2,
  "[mock:unsafe-output]": 2,
  "[mock:stuck]": 4,
} as const;
export const FLAG_FAIL = 1;
export const FLAG_NSFW = 2;
export const FLAG_STUCK = 4;

export const MAX_PAYLOAD_JSON = 250;
export const MAX_SNIPPET = 80;

const payloadSchema = z.object({
  /** Kind of job. */
  k: z.enum(MOCK_KINDS),
  /** Prompt / script snippet (directives removed). */
  p: z.string().max(MAX_SNIPPET),
  ar: z.enum(ASPECT_RATIOS),
  /** Number of outputs. */
  n: z.number().int().min(0).max(16),
  q: z.enum(["draft", "standard", "high"]),
  /** Output long side in px. */
  L: z.number().int().min(16).max(4096),
  s: z.number().int().min(0),
  /** Flag bits (FLAG_*). */
  f: z.number().int().min(0),
  /** Nonce: keeps request ids unique when identical jobs are submitted in the same ms. */
  r: z.string().max(12),
  /** Identity label carried into output markers (omitted = "default"). */
  id: z.string().max(16).optional(),
  /** Faces in the output (omitted = 1). */
  fc: z.number().int().min(0).max(4).optional(),
  /** Nominal video duration (s). */
  d: z.number().optional(),
  /** Training trigger word. */
  tw: z.string().max(40).optional(),
});
export type MockPayload = z.infer<typeof payloadSchema>;

export function encodePayload(payload: MockPayload): string {
  let p = payload;
  let json = JSON.stringify(p);
  while (json.length > MAX_PAYLOAD_JSON && p.p.length > 0) {
    p = { ...p, p: p.p.slice(0, Math.max(0, p.p.length - (json.length - MAX_PAYLOAD_JSON) - 1)) };
    json = JSON.stringify(p);
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodePayload(encoded: string): MockPayload | null {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function makeRequestId(submittedAt: number, payload: MockPayload): string {
  return `mock_${submittedAt}_${payload.k}_${encodePayload(payload)}`;
}

export function parseRequestId(requestId: string): { submittedAt: number; payload: MockPayload; encoded: string } | null {
  const m = /^mock_(\d+)_([a-z0-9]+)_([A-Za-z0-9_-]+)$/.exec(requestId);
  if (!m) return null;
  const payload = decodePayload(m[3]);
  if (!payload || payload.k !== m[2]) return null;
  return { submittedAt: Number(m[1]), payload, encoded: m[3] };
}

export type MockUrl =
  | { type: "image" | "video"; encoded: string; payload: MockPayload; index: number }
  | { type: "input"; sha: string };

export function parseMockUrl(url: string): MockUrl | null {
  const input = /^mock:\/\/input\/([a-f0-9]{64})$/.exec(url);
  if (input) return { type: "input", sha: input[1] };
  const out = /^mock:\/\/(image|video)\/([A-Za-z0-9_-]+)\/(\d+)$/.exec(url);
  if (!out) return null;
  const payload = decodePayload(out[2]);
  if (!payload) return null;
  return { type: out[1] as "image" | "video", encoded: out[2], payload, index: Number(out[3]) };
}

/** Split prompt directives from the visible text. */
export function parseDirectives(text: string): { flags: number; clean: string } {
  let flags = 0;
  let clean = text;
  for (const [token, bit] of Object.entries(MOCK_DIRECTIVES)) {
    if (clean.toLowerCase().includes(token)) {
      flags |= bit;
      clean = clean.replace(new RegExp(token.replace(/[[\]]/g, "\\$&"), "gi"), " ");
    }
  }
  return { flags, clean };
}

/** Single-line, control-char-free snippet of at most MAX_SNIPPET chars. */
export function snippet(text: string, max = MAX_SNIPPET): string {
  const s = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Output long side per quality tier. */
export const LONG_SIDE = { draft: 512, standard: 1024, high: 1536 } as const;

/** Width/height for an aspect ratio and long side, rounded to multiples of 8. */
export function outputSize(ar: AspectRatio, longSide: number): { width: number; height: number } {
  const [a, b] = ar.split(":").map(Number);
  const short = Math.max(8, Math.round((longSide * Math.min(a, b)) / Math.max(a, b) / 8) * 8);
  return a >= b ? { width: longSide, height: short } : { width: short, height: longSide };
}

export function closestAspectRatio(width: number, height: number): AspectRatio {
  const target = Math.log(width / height);
  let best: AspectRatio = "1:1";
  let bestDiff = Infinity;
  for (const ar of ASPECT_RATIOS) {
    const [a, b] = ar.split(":").map(Number);
    const diff = Math.abs(Math.log(a / b) - target);
    if (diff < bestDiff) {
      best = ar;
      bestDiff = diff;
    }
  }
  return best;
}
