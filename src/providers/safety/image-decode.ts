/**
 * Decode arbitrary image bytes (JPEG/PNG/WebP/HEIF…) into raw 8-bit RGB pixels with sharp.
 * EXIF orientation is applied, alpha is flattened onto white, grayscale/CMYK become sRGB.
 */
import type { Sharp, SharpOptions } from "sharp";

type SharpFactory = (input?: Uint8Array, options?: SharpOptions) => Sharp;

let sharpModule: Promise<SharpFactory> | undefined;

/** sharp is loaded lazily so importing a provider factory stays cheap. */
export function loadSharp(): Promise<SharpFactory> {
  sharpModule ??= import("sharp").then((m) => (m.default ?? m) as unknown as SharpFactory);
  return sharpModule;
}

export interface RgbImage {
  /** Interleaved RGB bytes, row-major, length = width * height * 3. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Dimensions of the upright source image before any resize. */
  sourceWidth: number;
  sourceHeight: number;
}

export interface DecodeOptions {
  /** Downscale so that the longest side is at most this many pixels (never upscales). */
  maxSide?: number;
  /** Resize to exactly this square size (ignores aspect ratio), e.g. 224 for classifiers. */
  square?: number;
}

/** Guard against decompression bombs: ~100 MP is far above any legitimate upload. */
const LIMIT_INPUT_PIXELS = 100_000_000;

export async function decodeRgb(bytes: Uint8Array, opts: DecodeOptions = {}): Promise<RgbImage> {
  const sharp = await loadSharp();
  const base = sharp(bytes, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "error" }).rotate();
  const meta = await base.clone().metadata();
  const swap = (meta.orientation ?? 1) >= 5; // EXIF orientations 5-8 swap width/height
  const sourceWidth = (swap ? meta.height : meta.width) ?? 0;
  const sourceHeight = (swap ? meta.width : meta.height) ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error("safety: could not read image dimensions");

  let pipeline = base.flatten({ background: "#ffffff" }).toColourspace("srgb");
  if (opts.square) {
    pipeline = pipeline.resize(opts.square, opts.square, { fit: "fill" });
  } else if (opts.maxSide) {
    pipeline = pipeline.resize(opts.maxSide, opts.maxSide, { fit: "inside", withoutEnlargement: true });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`safety: expected 3 channels after decode, got ${info.channels}`);
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    sourceWidth,
    sourceHeight,
  };
}
