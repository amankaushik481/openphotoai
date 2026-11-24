/**
 * Brush inpainting handler: repaint the white area of a user-painted mask (uploads purpose "mask") on a photo
 * OpenShoot generated for this user, with the photo's identity model when it is still usable. The mask must have
 * the photo's aspect ratio (±2%); a mask of another size (or with transparency) is normalized server-side to the
 * photo's exact pixel size as a pure black/white PNG before it is sent to the provider.
 * Completion uses the default ingestion (outputs get `parentMediaId` = the source photo).
 */
import sharp, { type SharpOptions } from "sharp";
import type { MediaRow, UploadRow } from "@/db/types";
import { getImageProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { getOwnedUpload, providerInputUrl } from "@/server/media/service";
import { getStorage, storageKeys } from "@/server/storage";
import type { Subject } from "@/types/domain";
import { cleanInstruction, loadImageSource, sourceIdentity, usableSourceModel } from "./edit";
import { defineHandler } from "./types";

/** A mask's aspect ratio may differ from the photo's by at most this fraction. */
export const MASK_ASPECT_TOLERANCE = 0.02;
/** Longest side the painted-area check samples at (the exact count doesn't matter, only "anything painted"). */
const COVERAGE_SAMPLE_SIDE = 1024;
/** Grey level (0-255, after flattening onto black) above which a sampled pixel counts as painted. */
const COVERAGE_MIN_LEVEL = 8;
const BLACK = { r: 0, g: 0, b: 0 };
const IMAGE_OPTIONS: SharpOptions = { failOn: "error", limitInputPixels: 100_000_000 };

export interface Dimensions {
  width: number;
  height: number;
}

export interface MaskInfo extends Dimensions {
  /** Has (partly) transparent pixels, which providers may read inconsistently. */
  hasAlpha: boolean;
  /** 0..1 fraction of the mask that is painted (white = repaint). */
  coverage: number;
}

/** Persisted on jobs.output.plan (JSON). */
export type InpaintPlanData = {
  prompt: string;
  sourceKey: string;
  sourceMime: string;
  maskUploadId: string;
  maskKey: string;
  /** The source photo's pixel size: the mask sent to the provider has exactly this size. */
  width: number;
  height: number;
  /** The stored mask must be resized / flattened before submission. */
  normalizeMask: boolean;
  parentMediaId: string;
  scoreLikeness: boolean;
};

/* ───────────── mask helpers (pure-ish: bytes in, bytes/info out) ───────────── */

/** True when `mask` has the same aspect ratio as `source` within `tolerance` (relative). */
export function maskAspectMatches(mask: Dimensions, source: Dimensions, tolerance = MASK_ASPECT_TOLERANCE): boolean {
  if (!(mask.width > 0 && mask.height > 0 && source.width > 0 && source.height > 0)) return false;
  const maskRatio = mask.width / mask.height;
  const sourceRatio = source.width / source.height;
  return Math.abs(maskRatio - sourceRatio) / sourceRatio <= tolerance;
}

/**
 * Painted fraction and transparency of raw pixels (1-4 channels: grey, grey+alpha, RGB, RGBA). A pixel's level is
 * its luminance composited onto black, so transparent pixels count as "keep".
 */
export function maskPixelStats(data: Uint8Array, channels: number, minLevel = COVERAGE_MIN_LEVEL): { coverage: number; transparent: boolean } {
  const pixels = Math.floor(data.length / channels);
  const alphaAt = channels === 2 ? 1 : channels === 4 ? 3 : -1;
  let painted = 0;
  let transparent = false;
  for (let p = 0; p < pixels; p++) {
    const i = p * channels;
    const lum = channels >= 3 ? 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! : data[i]!;
    const alpha = alphaAt >= 0 ? data[i + alphaAt]! : 255;
    if (alpha < 255) transparent = true;
    if ((lum * alpha) / 255 > minLevel) painted++;
  }
  return { coverage: painted / Math.max(1, pixels), transparent };
}

/** Size, transparency and painted fraction of a mask image (sampled at ≤1024px; exactness doesn't matter). */
export async function analyzeMask(bytes: Uint8Array): Promise<MaskInfo> {
  const meta = await sharp(bytes, IMAGE_OPTIONS).metadata();
  const { data, info } = await sharp(bytes, IMAGE_OPTIONS)
    .resize(COVERAGE_SAMPLE_SIDE, COVERAGE_SAMPLE_SIDE, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = maskPixelStats(data, info.channels);
  return { width: meta.width, height: meta.height, hasAlpha: stats.transparent, coverage: stats.coverage };
}

/**
 * Resize a mask to exactly `width`×`height` as an opaque black/white PNG: transparency is flattened onto black
 * (keep), and resampled edges are thresholded back to pure black or white.
 */
export async function resizeMask(bytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const out = await sharp(bytes, IMAGE_OPTIONS)
    .flatten({ background: BLACK })
    .greyscale()
    .resize(width, height, { fit: "fill" })
    .threshold(128)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Uint8Array(out);
}

/** Storage key of the normalized copy of a mask for a given target size (deterministic, so retries reuse it). */
export function normalizedMaskKey(userId: string, maskUploadId: string, size: Dimensions): string {
  return storageKeys.upload(userId, `${maskUploadId}_${size.width}x${size.height}`, "png");
}

/** Prompt for the repainted area; the rest of the photo is untouched by the mask. */
export function inpaintPrompt(prompt: string, subject?: Subject): string {
  const what = cleanInstruction(prompt, subject ? `the ${subject}` : "the person");
  return `${what}, seamlessly blended into the rest of the photo with matching lighting, perspective, colour and grain, photorealistic`;
}

/* ───────────── I/O ───────────── */

async function readMask(upload: UploadRow): Promise<MaskInfo> {
  const bytes = await getStorage().get(upload.storageKey);
  try {
    return await analyzeMask(bytes);
  } catch {
    throw errors.validation("That mask image couldn't be read. Paint the mask again.");
  }
}

async function sourceDimensions(source: MediaRow): Promise<Dimensions> {
  if (source.width && source.height) return { width: source.width, height: source.height };
  const meta = await sharp(await getStorage().get(source.storageKey), IMAGE_OPTIONS).metadata();
  return { width: meta.autoOrient?.width ?? meta.width, height: meta.autoOrient?.height ?? meta.height };
}

/** Provider URL of the mask at the photo's exact size (normalized + stored on first use when needed). */
async function preparedMaskUrl(userId: string, data: InpaintPlanData): Promise<string> {
  if (!data.normalizeMask) return providerInputUrl(data.maskKey, "image/png");
  const storage = getStorage();
  const size = { width: data.width, height: data.height };
  const key = normalizedMaskKey(userId, data.maskUploadId, size);
  if (!(await storage.exists(key))) {
    const resized = await resizeMask(await storage.get(data.maskKey), size.width, size.height);
    await storage.put(key, resized, { contentType: "image/png" });
  }
  return providerInputUrl(key, "image/png");
}

/* ───────────── handler ───────────── */

export default defineHandler({
  type: "inpaint",

  async plan({ user, input }) {
    if (!cleanInstruction(input.prompt, "")) throw errors.validation("Describe what to paint in the brushed area.");
    const source = await loadImageSource(user.id, input.sourceMediaId);
    const upload = await getOwnedUpload(user.id, input.maskUploadId, "mask");
    const [mask, target] = await Promise.all([readMask(upload), sourceDimensions(source)]);
    if (!maskAspectMatches(mask, target)) {
      throw errors.validation("This mask doesn't match the photo's shape. Paint the mask on this photo and try again.", {
        mask: { width: mask.width, height: mask.height },
        photo: target,
      });
    }
    if (mask.coverage <= 0) throw errors.validation("The mask is empty. Brush over the area you want to change.");

    const model = await usableSourceModel(user.id, source.modelId);
    const data: InpaintPlanData = {
      prompt: inpaintPrompt(input.prompt, model?.subject),
      sourceKey: source.storageKey,
      sourceMime: source.mimeType,
      maskUploadId: upload.id,
      maskKey: upload.storageKey,
      width: target.width,
      height: target.height,
      normalizeMask: mask.hasAlpha || mask.width !== target.width || mask.height !== target.height,
      parentMediaId: source.id,
      scoreLikeness: true,
    };
    return { modelId: model?.id ?? null, sourceMediaId: source.id, textsToModerate: [input.prompt], data };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as InpaintPlanData;
    // Inpainting uses the trained LoRA (or the subject's description), never reference photos.
    const [identity, imageUrl, maskUrl] = await Promise.all([
      sourceIdentity(user.id, plan.modelId, 0),
      providerInputUrl(data.sourceKey, data.sourceMime),
      preparedMaskUrl(user.id, data),
    ]);
    return getImageProvider().submitInpaint(
      { imageUrl, maskUrl, prompt: data.prompt, ...(identity ? { identity } : {}) },
      submitOpts,
    );
  },
});
