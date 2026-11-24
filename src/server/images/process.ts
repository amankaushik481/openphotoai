/**
 * Image utilities on top of sharp. CONTRACT FILE (owner: storage workstream).
 */
export interface NormalizedImage {
  /** JPEG bytes, auto-rotated, EXIF/GPS stripped, sRGB. */
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/jpeg";
}

/** Decode any supported upload, auto-rotate, strip all metadata, cap the longest side, re-encode JPEG. */
export async function normalizeImage(input: Uint8Array, opts?: { maxSide?: number; quality?: number }): Promise<NormalizedImage> {
  void input;
  void opts;
  throw new Error("not implemented: normalizeImage");
}

/** WebP thumbnail (default 512px longest side). */
export async function makeThumbnail(input: Uint8Array, size = 512): Promise<Uint8Array> {
  void input;
  void size;
  throw new Error("not implemented: makeThumbnail");
}

/** Technical metrics for the quality checker. */
export async function imageMetrics(input: Uint8Array): Promise<{ width: number; height: number; sharpness: number; brightness: number; contrast: number }> {
  void input;
  throw new Error("not implemented: imageMetrics");
}

/** 64-bit perceptual hash (dHash) as 16 hex chars. */
export async function perceptualHash(input: Uint8Array): Promise<string> {
  void input;
  throw new Error("not implemented: perceptualHash");
}

export function hammingDistance(a: string, b: string): number {
  void a;
  void b;
  throw new Error("not implemented: hammingDistance");
}

/**
 * Mark an output as AI-generated: embeds XMP/IPTC metadata
 * (Iptc4xmpExt:DigitalSourceType = trainedAlgorithmicMedia, plus generator + job id).
 * Returns JPEG/PNG bytes with the metadata. Never strips this from outputs.
 */
export async function applyAiLabel(
  input: Uint8Array,
  info: { generator: string; jobId: string; createdAt: Date },
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  void input;
  void info;
  throw new Error("not implemented: applyAiLabel");
}

/** Visible watermark (free tier). */
export async function applyWatermark(input: Uint8Array, text: string): Promise<Uint8Array> {
  void input;
  void text;
  throw new Error("not implemented: applyWatermark");
}

/** Crop a region (e.g. a face box) — used for likeness scoring. */
export async function cropRegion(input: Uint8Array, box: { x: number; y: number; width: number; height: number }, pad = 0.25): Promise<Uint8Array> {
  void input;
  void box;
  void pad;
  throw new Error("not implemented: cropRegion");
}

/** Probe a video: duration + first-frame JPEG + N evenly spaced frames (ffmpeg-static). */
export async function extractVideoFrames(video: Uint8Array, count = 3): Promise<{ durationSec: number; width: number; height: number; frames: Uint8Array[] }> {
  void video;
  void count;
  throw new Error("not implemented: extractVideoFrames");
}
