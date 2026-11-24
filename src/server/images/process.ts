/**
 * Image utilities on top of sharp. CONTRACT FILE (owner: storage workstream).
 */
import sharp, { type Metadata, type Sharp, type SharpOptions } from "sharp";
import { APP } from "@/config/app";
import { AppError } from "@/server/http";
import { extractFrames } from "./video";
import { buildAiXmp, parseAiXmp, type AiLabelInfo } from "./xmp";

export { TRAINED_ALGORITHMIC_MEDIA, type AiLabelInfo } from "./xmp";

export interface NormalizedImage {
  /** JPEG bytes, auto-rotated, EXIF/GPS stripped, sRGB. */
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/jpeg";
}

/**
 * Untrusted input: fail on real decode errors (but tolerate the harmless warnings many phone JPEGs
 * trigger), cap decoded pixels to avoid memory bombs, apply EXIF orientation up front.
 */
const INPUT_OPTIONS: SharpOptions = { failOn: "error", limitInputPixels: 100_000_000, autoOrient: true };
const WHITE = { r: 255, g: 255, b: 255 };

const unreadable = () =>
  new AppError("validation_error", "We couldn't read this image. Please upload a JPEG, PNG or WebP photo.");
const heicUnsupported = () =>
  new AppError(
    "validation_error",
    "HEIC photos aren't supported. Please export the photo as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible) and try again.",
  );

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** ISO-BMFF `ftyp` box with a HEIF/HEVC brand (sharp's prebuilt binaries can't decode HEVC). */
function looksLikeHeic(input: Uint8Array): boolean {
  if (input.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...input.subarray(from, to));
  return ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12).toLowerCase());
}

/** Run sharp work on untrusted bytes; any decode failure becomes a friendly validation error. */
async function withImage<T>(input: Uint8Array, run: (open: () => Sharp) => Promise<T>): Promise<T> {
  try {
    return await run(() => sharp(input, INPUT_OPTIONS));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw looksLikeHeic(input) ? heicUnsupported() : unreadable();
  }
}

/** Display dimensions (after EXIF orientation). */
function orientedSize(meta: Metadata): { width: number; height: number } {
  return { width: meta.autoOrient?.width ?? meta.width, height: meta.autoOrient?.height ?? meta.height };
}

/** Decode any supported upload, auto-rotate, strip all metadata, cap the longest side, re-encode JPEG. */
export async function normalizeImage(input: Uint8Array, opts?: { maxSide?: number; quality?: number }): Promise<NormalizedImage> {
  const maxSide = opts?.maxSide ?? 2048;
  const quality = opts?.quality ?? 90;
  return withImage(input, async (open) => {
    // No withMetadata()/keep*() call: sharp drops EXIF (incl. GPS), XMP, IPTC and ICC and outputs sRGB.
    const { data, info } = await open()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .flatten({ background: WHITE })
      .toColourspace("srgb")
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, mimeType: "image/jpeg" };
  });
}

/** WebP thumbnail (default 512px longest side). */
export async function makeThumbnail(input: Uint8Array, size = 512): Promise<Uint8Array> {
  return withImage(input, (open) =>
    open().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Luminance mean/stdev plus variance of the 4-neighbour Laplacian.
 * Computed in JS because libvips clips uchar convolution output to 0..255, which loses the
 * negative half of the Laplacian response.
 */
function luminanceStats(data: Uint8Array, width: number, height: number, channels: number) {
  const n = width * height;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = data[i * channels];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const stdev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

  let lSum = 0;
  let lSq = 0;
  let count = 0;
  const px = (x: number, y: number) => data[(y * width + x) * channels];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const l = px(x, y - 1) + px(x, y + 1) + px(x - 1, y) + px(x + 1, y) - 4 * px(x, y);
      lSum += l;
      lSq += l * l;
      count++;
    }
  }
  const lapMean = count ? lSum / count : 0;
  const lapVar = count ? Math.max(0, lSq / count - lapMean * lapMean) : 0;
  return { mean, stdev, lapVar };
}

/** Technical metrics for the quality checker. */
export async function imageMetrics(input: Uint8Array): Promise<{ width: number; height: number; sharpness: number; brightness: number; contrast: number }> {
  return withImage(input, async (open) => {
    const { width, height } = orientedSize(await open().metadata());
    // Normalize scale (max 512px) so sharpness is comparable across resolutions.
    const { data, info } = await open()
      .flatten({ background: WHITE })
      .grayscale()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const s = luminanceStats(data, info.width, info.height, info.channels);
    return { width, height, sharpness: round2(s.lapVar), brightness: round2(s.mean), contrast: round2(s.stdev) };
  });
}

/** 64-bit perceptual hash (dHash) as 16 hex chars. */
export async function perceptualHash(input: Uint8Array): Promise<string> {
  return withImage(input, async (open) => {
    const { data, info } = await open()
      .flatten({ background: WHITE })
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const c = info.channels;
    let hex = "";
    let nibble = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[(y * 9 + x) * c];
        const right = data[(y * 9 + x + 1) * c];
        nibble = (nibble << 1) | (left > right ? 1 : 0);
        if (x % 4 === 3) {
          hex += nibble.toString(16);
          nibble = 0;
        }
      }
    }
    return hex;
  });
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length || !/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) {
    throw new Error("hammingDistance: expected two hex hashes of equal length");
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/** True when the image has an alpha channel that is actually used. */
async function hasTransparency(open: () => Sharp, meta: Metadata): Promise<boolean> {
  if (!meta.hasAlpha) return false;
  return !(await open().stats()).isOpaque;
}

/**
 * Mark an output as AI-generated: embeds XMP/IPTC metadata
 * (Iptc4xmpExt:DigitalSourceType = trainedAlgorithmicMedia, plus generator + job id).
 * Returns JPEG/PNG bytes with the metadata. Never strips this from outputs.
 *
 * Output is JPEG (q92); images with real transparency (e.g. background removal) stay PNG.
 */
export async function applyAiLabel(
  input: Uint8Array,
  info: { generator: string; jobId: string; createdAt: Date },
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const xmp = buildAiXmp({ ...info, appName: APP.name });
  return withImage(input, async (open) => {
    if (await hasTransparency(open, await open().metadata())) {
      return { bytes: await open().withXmp(xmp).png({ compressionLevel: 9 }).toBuffer(), mimeType: "image/png" };
    }
    const bytes = await open().flatten({ background: WHITE }).withXmp(xmp).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    return { bytes, mimeType: "image/jpeg" };
  });
}

/** Read the AI label written by `applyAiLabel` (null when absent or unreadable). For tests + admin. */
export async function readAiLabel(bytes: Uint8Array): Promise<AiLabelInfo | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const xmp = meta.xmpAsString ?? meta.xmp?.toString("utf8");
    return xmp ? parseAiXmp(xmp) : null;
  } catch {
    return null;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Pill-shaped label SVG sized to the image width, or null when the image is too small to carry one. */
function watermarkOverlay(width: number, height: number, text: string): { svg: Buffer; left: number; top: number } | null {
  const margin = Math.max(4, Math.round(width * 0.02));
  // Generous average glyph width so the text never overflows the pill.
  const boxFor = (fontSize: number) => {
    const padX = Math.round(fontSize * 0.8);
    const padY = Math.round(fontSize * 0.45);
    return { padX, w: Math.ceil(text.length * fontSize * 0.62) + 2 * padX, h: fontSize + 2 * padY };
  };
  let fontSize = Math.round(Math.min(Math.max(width * 0.028, 12), 72));
  const first = boxFor(fontSize);
  const fit = Math.min(1, (width - 2 * margin) / first.w, (height - 2 * margin) / first.h);
  fontSize = Math.floor(fontSize * fit);
  if (fontSize < 6) return null;
  const box = boxFor(fontSize);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}">
  <rect width="${box.w}" height="${box.h}" rx="${box.h / 2}" ry="${box.h / 2}" fill="#000000" fill-opacity="0.45"/>
  <text x="${box.w / 2}" y="${(box.h / 2 + fontSize * 0.35).toFixed(1)}" text-anchor="middle" font-family="Inter, 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff" fill-opacity="0.92">${escapeXml(text)}</text>
</svg>`;
  return { svg: Buffer.from(svg), left: width - box.w - margin, top: height - box.h - margin };
}

/** Re-encode in the input's format family (keeps PNG/WebP transparency), JPEG otherwise. */
function encodeLike(img: Sharp, meta: Metadata): Promise<Buffer> {
  if (meta.format === "png") return img.png({ compressionLevel: 9 }).toBuffer();
  if (meta.format === "webp") return img.webp({ quality: 90 }).toBuffer();
  return img.flatten({ background: WHITE }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** Visible watermark (free tier): bottom-right "<App> · AI" pill. Keeps any XMP (AI label). */
export async function applyWatermark(input: Uint8Array, text = `${APP.name} · AI`): Promise<Uint8Array> {
  return withImage(input, async (open) => {
    const meta = await open().metadata();
    const { width, height } = orientedSize(meta);
    const overlay = watermarkOverlay(width, height, text);
    let img = open().keepXmp();
    if (overlay) img = img.composite([{ input: overlay.svg, left: overlay.left, top: overlay.top }]);
    return encodeLike(img, meta);
  });
}

/** Crop a region (e.g. a face box) — used for likeness scoring. */
export async function cropRegion(input: Uint8Array, box: { x: number; y: number; width: number; height: number }, pad = 0.25): Promise<Uint8Array> {
  return withImage(input, async (open) => {
    const { width, height } = orientedSize(await open().metadata());
    const p = Math.max(0, pad);
    const left = Math.max(0, Math.floor(box.x - box.width * p));
    const top = Math.max(0, Math.floor(box.y - box.height * p));
    const right = Math.min(width, Math.ceil(box.x + box.width * (1 + p)));
    const bottom = Math.min(height, Math.ceil(box.y + box.height * (1 + p)));
    if (!(right - left >= 1 && bottom - top >= 1)) {
      throw new AppError("validation_error", "The crop region is outside the image.");
    }
    return open()
      .extract({ left, top, width: right - left, height: bottom - top })
      .flatten({ background: WHITE })
      .jpeg({ quality: 92 })
      .toBuffer();
  });
}

/** Probe a video: duration + first-frame JPEG + N evenly spaced frames (ffmpeg-static). */
export async function extractVideoFrames(video: Uint8Array, count = 3): Promise<{ durationSec: number; width: number; height: number; frames: Uint8Array[] }> {
  return extractFrames(video, count);
}
