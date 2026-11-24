/**
 * Aspect ratio -> pixel size helpers shared by AI adapters.
 *
 * Providers such as fal bill FLUX per megapixel *rounded up*, so sizes are chosen to stay at or under a
 * pixel budget (1 MP = 1024 x 1024 px, fal's own "square_hd" preset) instead of hitting a fixed long side.
 */
import type { AspectRatio } from "@/types/domain";

export interface Dimensions {
  width: number;
  height: number;
}

/** 1 MP as providers count it for billing (1024 x 1024). */
export const MEGAPIXEL = 1024 * 1024;

export interface FitOptions {
  /** Maximum width * height. */
  maxPixels: number;
  /** Optional cap on the longer side. */
  maxLongSide?: number;
  /** Both sides are multiples of this (latent-space models need 16). Default 16. */
  multiple?: number;
}

/** "4:5" -> [4, 5] (width, height). */
export function aspectRatioParts(ratio: AspectRatio): [number, number] {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) throw new Error(`Invalid aspect ratio: ${ratio}`);
  return [w, h];
}

/**
 * Largest size with the exact aspect ratio whose sides are multiples of `multiple` and that fits the budget,
 * e.g. 4:5 at 1 MP -> 896x1120, 1:1 at 1 MP -> 1024x1024, 9:16 at 1 MP -> 720x1280.
 * Falls back to the closest approximate ratio when the exact grid is too coarse for the budget.
 */
export function fitAspectRatio(ratio: AspectRatio, opts: FitOptions): Dimensions {
  const multiple = opts.multiple ?? 16;
  const maxLong = opts.maxLongSide ?? Number.POSITIVE_INFINITY;
  const [rw, rh] = aspectRatioParts(ratio);
  const g = gcd(rw, rh);
  const stepW = (rw / g) * multiple;
  const stepH = (rh / g) * multiple;

  let k = Math.floor(Math.sqrt(opts.maxPixels / (stepW * stepH)));
  while (k > 0 && Math.max(stepW * k, stepH * k) > maxLong) k--;
  if (k > 0) return { width: stepW * k, height: stepH * k };

  return approximateFit(rw / rh, opts.maxPixels, maxLong, multiple);
}

function approximateFit(ratio: number, maxPixels: number, maxLong: number, multiple: number): Dimensions {
  const idealW = Math.min(Math.sqrt(maxPixels * ratio), ratio >= 1 ? maxLong : maxLong * ratio);
  let width = Math.max(multiple, Math.floor(idealW / multiple) * multiple);
  let height = Math.max(multiple, Math.round(width / ratio / multiple) * multiple);
  while ((width * height > maxPixels || Math.max(width, height) > maxLong) && (width > multiple || height > multiple)) {
    if (width >= height && width > multiple) width -= multiple;
    else height -= multiple;
  }
  return { width, height };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function megapixels(d: Dimensions): number {
  return (d.width * d.height) / MEGAPIXEL;
}
