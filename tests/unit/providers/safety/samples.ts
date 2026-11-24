/**
 * Real face samples for the local ML tests, cropped at runtime from the screenshots that ship
 * inside node_modules/@vladmandic/human/assets (no fixtures committed, no network).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ASSETS = path.resolve(process.cwd(), "node_modules/@vladmandic/human/assets");
const FACE_ID = path.join(ASSETS, "screenshot-faceid.jpg");
const FACE_DETECT = path.join(ASSETS, "screenshot-facedetect.jpg");

export const hasHumanSamples = existsSync(FACE_ID) && existsSync(FACE_DETECT);
export const skipReason = "human sample images not found in node_modules/@vladmandic/human/assets";

async function crop(file: string, left: number, top: number, width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp(file).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
  return new Uint8Array(buf);
}

/** One adult man, frontal (faceid demo screenshot). */
export const manPortrait = () => crop(FACE_ID, 0, 120, 180, 180);
/** A different person: woman from the face-detect demo row (picked to be far from the man). */
export const womanPortrait = () => crop(FACE_DETECT, 478, 345, 150, 152);
/** Another different person (woman, black-and-white photo). */
export const otherWomanPortrait = () => crop(FACE_DETECT, 632, 345, 160, 152);

/** Plain synthetic image without any face. */
export async function blankImage(width = 640, height = 480): Promise<Uint8Array> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 200 } } })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

/** Smooth gradient (benign, non-photographic). */
export async function gradientImage(width = 512, height = 384): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round((x / width) * 255);
      raw[i + 1] = Math.round((y / height) * 255);
      raw[i + 2] = 128;
    }
  }
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer());
}
