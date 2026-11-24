/**
 * Enhancement rules shared by the enhance UI and the server job handlers (pure: no React, no I/O).
 * Upscale size limits, target-resolution math and the "already transparent" rule live here so the
 * UI can disable an action for exactly the reasons the server would refuse it.
 */

export const UPSCALE_SCALES = [2, 4] as const;
export type UpscaleScale = (typeof UPSCALE_SCALES)[number];

/** Sources at least this large (long side, px) are already high resolution: upscaling is refused. */
export const UPSCALE_MAX_SOURCE_LONG_SIDE = 4096;
/** An upscaled result may not be larger than this (long side, px). */
export const UPSCALE_MAX_RESULT_LONG_SIDE = 8192;

export interface ImageSize {
  width: number;
  height: number;
}

export type UpscaleBlock = "source_too_large" | "result_too_large";

const isPositiveInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/** A usable size from nullable width/height columns, or null when unknown. */
export function sizeOf(dims: { width: number | null | undefined; height: number | null | undefined }): ImageSize | null {
  return isPositiveInt(dims.width) && isPositiveInt(dims.height) ? { width: dims.width, height: dims.height } : null;
}

export const longSide = (size: ImageSize): number => Math.max(size.width, size.height);

/** Resolution of the upscaled result. */
export function upscaleTarget(size: ImageSize, scale: UpscaleScale): ImageSize {
  return { width: size.width * scale, height: size.height * scale };
}

/** Why an upscale is refused, or null when it is allowed (unknown sizes are checked server-side). */
export function upscaleBlock(size: ImageSize | null, scale: UpscaleScale): UpscaleBlock | null {
  if (!size) return null;
  const long = longSide(size);
  if (long >= UPSCALE_MAX_SOURCE_LONG_SIDE) return "source_too_large";
  if (long * scale > UPSCALE_MAX_RESULT_LONG_SIDE) return "result_too_large";
  return null;
}

/** Scales that may be used for a source of this size (all of them when the size is unknown). */
export function allowedUpscaleScales(size: ImageSize | null): UpscaleScale[] {
  return UPSCALE_SCALES.filter((s) => upscaleBlock(size, s) === null);
}

/** Plain-language explanation of an upscale block (used for the API error and the UI hint). */
export function upscaleBlockMessage(block: UpscaleBlock, size: ImageSize, scale: UpscaleScale): string {
  const long = longSide(size);
  if (block === "source_too_large") {
    return `This photo is already high resolution (${long} px on its long side), so it can't be upscaled further.`;
  }
  const target = longSide(upscaleTarget(size, scale));
  const smaller = UPSCALE_SCALES.find((s) => s < scale && upscaleBlock(size, s) === null);
  const tip = smaller ? ` Try ${smaller}× instead.` : "";
  return `A ${scale}× upscale would be ${target} px on its long side; the maximum is ${UPSCALE_MAX_RESULT_LONG_SIDE} px.${tip}`;
}

/**
 * Ingestion stores every output as JPEG unless it has real transparency (then PNG), so a PNG photo
 * already has its background removed.
 */
export function isTransparentImage(mimeType: string): boolean {
  return mimeType.split(";")[0]!.trim().toLowerCase() === "image/png";
}

export const VIDEO_NOT_SUPPORTED_MESSAGE = "Enhancements work on photos only. Pick a photo instead of a video.";
export const ALREADY_TRANSPARENT_MESSAGE = "This photo already has a transparent background.";
