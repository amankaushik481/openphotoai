/**
 * Client-side image preparation for uploads: decode (honoring EXIF orientation), downscale so the
 * longest side is ≤ maxSide, re-encode as JPEG. Re-encoding also strips EXIF/GPS before upload.
 * `computeResizeDimensions` is pure (unit-tested); everything else needs a browser.
 */
import { UPLOAD_LIMITS } from "@/config/app";

export interface ResizeDimensions {
  width: number;
  height: number;
  /** Factor applied to the source (≤ 1; images are never upscaled). */
  scale: number;
}

export function computeResizeDimensions(width: number, height: number, maxSide: number): ResizeDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid image dimensions: ${width}x${height}`);
  }
  if (!Number.isFinite(maxSide) || maxSide < 1) throw new RangeError(`Invalid maxSide: ${maxSide}`);
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height), scale: 1 };
  const scale = maxSide / longest;
  // The long side lands exactly on maxSide; the short side is rounded but never collapses to 0.
  return width >= height
    ? { width: Math.floor(maxSide), height: Math.max(1, Math.round(height * scale)), scale }
    : { width: Math.max(1, Math.round(width * scale)), height: Math.floor(maxSide), scale };
}

/**
 * Intermediate sizes for progressive halving. Browsers that ignore `imageSmoothingQuality`
 * alias badly when shrinking > 2× in one draw, so we halve until within 2× of the target.
 */
export function downscaleSteps(
  from: { width: number; height: number },
  to: { width: number; height: number },
): Array<{ width: number; height: number }> {
  const steps: Array<{ width: number; height: number }> = [];
  let w = from.width;
  let h = from.height;
  while (w / 2 >= to.width * 1.0001 && h / 2 >= to.height * 1.0001) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    steps.push({ width: w, height: h });
  }
  steps.push({ width: to.width, height: to.height });
  return steps;
}

export type OutputType = "image/jpeg" | "image/png" | "image/webp";

export interface PrepareOptions {
  maxSide?: number;
  /** Encoder quality 0–1 (JPEG/WebP). */
  quality?: number;
  type?: OutputType;
  /** Fill behind transparent pixels when encoding to JPEG. */
  background?: string;
}

export interface PreparedImage {
  file: File;
  width: number | null;
  height: number | null;
  /** False when the browser couldn't decode the image and the original is passed through. */
  processed: boolean;
}

export class ImageDecodeError extends Error {
  constructor() {
    super("unreadable");
    this.name = "ImageDecodeError";
  }
}

type Drawable = ImageBitmap | HTMLImageElement;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img> (older Safari rejects the options bag; HEIC on Safari decodes via <img>).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(src: Drawable) {
  return "naturalWidth" in src ? { width: src.naturalWidth, height: src.naturalHeight } : { width: src.width, height: src.height };
}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function context2d(canvas: AnyCanvas) {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new ImageDecodeError();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

async function toBlob(canvas: AnyCanvas, type: OutputType, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageDecodeError())), type, quality),
  );
}

function renamed(name: string, type: OutputType): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${ext}`;
}

/** Decode → orient → downscale → re-encode. Passes the original through if the browser can't decode it. */
export async function prepareImageForUpload(file: File, options: PrepareOptions = {}): Promise<PreparedImage> {
  const maxSide = options.maxSide ?? UPLOAD_LIMITS.clientMaxSide;
  const quality = options.quality ?? 0.9;
  const type = options.type ?? "image/jpeg";

  let source: Drawable;
  try {
    source = await decode(file);
  } catch {
    if (file.size <= UPLOAD_LIMITS.maxBytes) return { file, width: null, height: null, processed: false };
    throw new ImageDecodeError();
  }

  try {
    const natural = sizeOf(source);
    const target = computeResizeDimensions(natural.width, natural.height, maxSide);
    let current: CanvasImageSource = source;
    let canvas: AnyCanvas | null = null;
    for (const step of downscaleSteps(natural, target)) {
      const next = makeCanvas(step.width, step.height);
      const ctx = context2d(next);
      if (type === "image/jpeg") {
        ctx.fillStyle = options.background ?? "#ffffff";
        ctx.fillRect(0, 0, step.width, step.height);
      }
      ctx.drawImage(current, 0, 0, step.width, step.height);
      current = next;
      canvas = next;
    }
    const blob = await toBlob(canvas as AnyCanvas, type, quality);
    return {
      file: new File([blob], renamed(file.name, type), { type, lastModified: Date.now() }),
      width: target.width,
      height: target.height,
      processed: true,
    };
  } finally {
    if ("close" in source) source.close();
  }
}
