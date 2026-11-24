/**
 * Shared fixtures for the edit / inpaint / pose-copy tests: real image bytes in temp storage for media rows and
 * uploads (providerInputUrl reads them back), and black/white mask PNGs.
 */
import sharp from "sharp";
import type { MediaRow, UploadRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { getStorage, storageKeys } from "@/server/storage";
import { createTestMedia, createTestUpload } from "../../helpers/factories";
import { pngBytes } from "../jobs/fixtures";

/** A generated photo of `width`×`height` whose bytes exist in storage. */
export async function createStoredMedia(
  userId: string,
  overrides: Partial<Parameters<typeof createTestMedia>[1]> & { width?: number; height?: number } = {},
): Promise<MediaRow> {
  const id = overrides.id ?? newId("med");
  const width = overrides.width ?? 400;
  const height = overrides.height ?? 500;
  const key = storageKeys.media(userId, id, "png");
  await getStorage().put(key, await pngBytes(width, height), { contentType: "image/png" });
  return createTestMedia(userId, { ...overrides, id, width, height, storageKey: key, mimeType: "image/png" });
}

/**
 * Black/white mask PNG: white (repaint) inside `rect`, black elsewhere. `alpha` adds an alpha channel where
 * the unpainted area is fully transparent.
 */
export async function maskPng(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number } | null = { x: 0, y: 0, w: Math.ceil(width / 4), h: Math.ceil(height / 4) },
  opts: { alpha?: boolean } = {},
): Promise<Uint8Array> {
  const channels = opts.alpha ? 2 : 1;
  const raw = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = rect !== null && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const i = (y * width + x) * channels;
      raw[i] = inside ? 255 : 0;
      if (opts.alpha) raw[i + 1] = inside ? 255 : 0;
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
  return new Uint8Array(png);
}

/** A stored mask upload (purpose "mask") of the given size. */
export async function createMaskUpload(
  userId: string,
  width: number,
  height: number,
  opts: { bytes?: Uint8Array; purpose?: UploadRow["purpose"] } = {},
): Promise<UploadRow> {
  const id = newId("upl");
  const key = storageKeys.upload(userId, id, "png");
  await getStorage().put(key, opts.bytes ?? (await maskPng(width, height)), { contentType: "image/png" });
  return createTestUpload(userId, { id, purpose: opts.purpose ?? "mask", storageKey: key, mimeType: "image/png", width, height });
}

/** A stored "reference" upload (pose copy). */
export async function createReferenceUpload(userId: string, width = 600, height = 800, purpose: UploadRow["purpose"] = "reference") {
  const id = newId("upl");
  const key = storageKeys.upload(userId, id, "png");
  await getStorage().put(key, await pngBytes(width, height), { contentType: "image/png" });
  return createTestUpload(userId, { id, purpose, storageKey: key, mimeType: "image/png", width, height });
}

/** Decoded size + distinct grey levels of a PNG. */
export async function describePng(bytes: Uint8Array): Promise<{ width: number; height: number; levels: number[] }> {
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  const levels = new Set<number>();
  for (let i = 0; i < data.length; i += info.channels) levels.add(data[i]!);
  return { width: info.width, height: info.height, levels: [...levels].sort((a, b) => a - b) };
}
