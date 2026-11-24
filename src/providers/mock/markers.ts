/**
 * Mock marker protocol: deterministic test signals for the mock face / moderation / AI
 * providers, encoded in PIXELS so they survive JPEG re-encoding, resizing and EXIF
 * stripping (the upload pipeline always does all three).
 *
 * Layout — a row of 5 flat colour cells along the top edge, starting at the top-left
 * corner; each cell is a square with side = 6% of the image width:
 *
 *   cell0  magenta (255,0,255)     marker present
 *   cell1  identity                hue bucket 0-11 (30° apart) → MOCK_IDENTITIES[bucket];
 *                                  an unsaturated (grey) cell means "default"
 *   cell2  age                     red channel = age in years
 *   cell3  face count              green channel / 50 (0..4)
 *   cell4  flags                   blue channel high bits: 0x20 nsfw, 0x40 blurry hint (unused),
 *                                  0x80 public figure  (decoded as round(blue / 32))
 *
 * Optional head pose (only when `marker.pose` is set; images without it keep the 5-cell layout):
 *
 *   cell5  cyan (0,255,255)        pose present
 *   cell6  yaw                     grey = 128 + 2·yaw   (yaw ∈ [-63, 63], negative = subject's own left)
 *   cell7  pitch                   grey = 128 + 2·pitch (pitch ∈ [-63, 63], positive = looking up)
 *
 * The mock face provider reports this pose instead of the pixel-derived one, so test fixtures and the
 * e2e fake camera can satisfy the active-liveness head-pose challenge deterministically.
 *
 * Decoding averages the inner half of each cell; the presence check allows ±24 per channel.
 * Images without a marker decode to `null`; callers fall back to DEFAULT_MARKER
 * (1 face, age 30, identity "default", no flags).
 */
import type { Sharp } from "sharp";

export const MOCK_IDENTITIES = [
  "alice",
  "bob",
  "carol",
  "dave",
  "erin",
  "frank",
  "grace",
  "heidi",
  "ivan",
  "judy",
  "mallory",
  "oscar",
] as const;
export type MockIdentity = (typeof MOCK_IDENTITIES)[number] | "default";

/** Head pose in degrees (same convention as `DetectedFace`). */
export interface MarkerPose {
  yaw: number;
  pitch: number;
}

export interface Marker {
  identity: MockIdentity;
  /** Age in years (0..255). */
  age: number;
  /** Number of faces (0..4). */
  faces: number;
  nsfw: boolean;
  /** Reserved hint; the mock face provider does not use it (blur is measured from pixels). */
  blurry: boolean;
  publicFigure: boolean;
  /** Optional explicit head pose (cells 5-7). */
  pose?: MarkerPose;
}

export const DEFAULT_MARKER: Readonly<Marker> = Object.freeze({
  identity: "default",
  age: 30,
  faces: 1,
  nsfw: false,
  blurry: false,
  publicFigure: false,
});

export const MARKER_CELL_COUNT = 5;
/** Extra cells (sentinel, yaw, pitch) appended when the marker carries a pose. */
export const POSE_CELL_COUNT = 3;
/** Largest |yaw| / |pitch| a pose cell can encode. */
export const MAX_MARKER_POSE = 63;
/** Cell side as a fraction of the image width. */
export const MARKER_CELL_RATIO = 0.06;
/** Per-channel tolerance for the presence (magenta) check. */
export const MARKER_TOLERANCE = 24;

const MAGENTA: Rgb = [255, 0, 255];
const CYAN: Rgb = [0, 255, 255];
const POSE_SCALE = 2;
const GREY: Rgb = [128, 128, 128];
const FLAG_NSFW = 1;
const FLAG_BLURRY = 2;
const FLAG_PUBLIC_FIGURE = 4;
const FLAG_STEP = 32;
const FACE_STEP = 50;
const MAX_FACES = 4;

type Rgb = [number, number, number];

export interface MarkerCell {
  left: number;
  top: number;
  size: number;
  rgb: Rgb;
}

export function markerCellSide(width: number): number {
  return Math.max(4, Math.round(width * MARKER_CELL_RATIO));
}

export function isMockIdentity(label: string): label is MockIdentity {
  return label === "default" || (MOCK_IDENTITIES as readonly string[]).includes(label);
}

/** Merge a partial marker with the defaults and clamp values into the encodable range. */
export function normalizeMarker(marker: Partial<Marker> = {}): Marker {
  const m = { ...DEFAULT_MARKER, ...marker };
  const normalized: Marker = {
    identity: isMockIdentity(m.identity) ? m.identity : "default",
    age: clampInt(m.age, 0, 255),
    faces: clampInt(m.faces, 0, MAX_FACES),
    nsfw: Boolean(m.nsfw),
    blurry: Boolean(m.blurry),
    publicFigure: Boolean(m.publicFigure),
  };
  if (m.pose) {
    normalized.pose = {
      yaw: clampInt(m.pose.yaw, -MAX_MARKER_POSE, MAX_MARKER_POSE),
      pitch: clampInt(m.pose.pitch, -MAX_MARKER_POSE, MAX_MARKER_POSE),
    };
  }
  return normalized;
}

export function isDefaultMarker(marker: Marker): boolean {
  const m = normalizeMarker(marker);
  return !m.pose && (Object.keys(DEFAULT_MARKER) as (keyof Marker)[]).every((k) => m[k] === DEFAULT_MARKER[k]);
}

/** Geometry + colour of every cell for an image of the given width. */
export function markerCells(width: number, marker: Partial<Marker> = {}): MarkerCell[] {
  const m = normalizeMarker(marker);
  const size = markerCellSide(width);
  const flags = (m.nsfw ? FLAG_NSFW : 0) | (m.blurry ? FLAG_BLURRY : 0) | (m.publicFigure ? FLAG_PUBLIC_FIGURE : 0);
  const colours: Rgb[] = [
    MAGENTA,
    m.identity === "default" ? GREY : hueToRgb(MOCK_IDENTITIES.indexOf(m.identity) * 30),
    [m.age, m.age, m.age],
    [0, m.faces * FACE_STEP, 0],
    [0, 0, flags * FLAG_STEP],
  ];
  if (m.pose) {
    const yaw = 128 + m.pose.yaw * POSE_SCALE;
    const pitch = 128 + m.pose.pitch * POSE_SCALE;
    colours.push(CYAN, [yaw, yaw, yaw], [pitch, pitch, pitch]);
  }
  return colours.map((rgb, i) => ({ left: i * size, top: 0, size, rgb }));
}

/**
 * Paint the marker into a raw interleaved pixel buffer in place (used for video frames).
 * `channels` is 3 (RGB) or 4 (RGBA; alpha set opaque).
 */
export function paintMarkerRaw(
  data: Uint8Array,
  info: { width: number; height: number; channels: number },
  marker: Partial<Marker>,
): void {
  for (const cell of markerCells(info.width, marker)) {
    const maxY = Math.min(info.height, cell.top + cell.size);
    const maxX = Math.min(info.width, cell.left + cell.size);
    for (let y = cell.top; y < maxY; y++) {
      for (let x = cell.left; x < maxX; x++) {
        const o = (y * info.width + x) * info.channels;
        data[o] = cell.rgb[0];
        data[o + 1] = cell.rgb[1];
        data[o + 2] = cell.rgb[2];
        if (info.channels === 4) data[o + 3] = 255;
      }
    }
  }
}

/**
 * Stamp `marker` onto an image. Consumes the given pipeline (its output is read as raw
 * pixels) and returns a new pipeline with the cells composited; chain `.jpeg()` / `.png()`.
 * Render the image at its final size first: cell geometry depends on the width.
 */
export async function encodeMarker(image: Sharp, marker: Partial<Marker> = {}): Promise<Sharp> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  paintMarkerRaw(pixels, info, marker);
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/** Read a marker from encoded image bytes. Returns null when absent or the bytes are not an image. */
export async function decodeMarker(bytes: Uint8Array): Promise<Marker | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes).metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return null;
    const side = markerCellSide(width);
    if (side * MARKER_CELL_COUNT > width || side > height) return null;

    const { data, info } = await sharp(bytes, { autoOrient: true })
      .extract({ left: 0, top: 0, width: side * MARKER_CELL_COUNT, height: side })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const cells = Array.from({ length: MARKER_CELL_COUNT }, (_, i) => cellStats(data, info, i * side, side));
    const [presence, identityCell, ageCell, facesCell, flagsCell] = cells;
    const isMagenta = presence.mean.every((v, c) => Math.abs(v - MAGENTA[c]) <= MARKER_TOLERANCE);
    if (!isMagenta || Math.max(...presence.std) > 30) return null;
    // Structural checks against look-alikes (e.g. a flat magenta image): the age cell is grey,
    // the face cell has only green, the flag cell only blue.
    const [ar, ag, ab] = ageCell.mean;
    const isGrey = Math.max(ar, ag, ab) - Math.min(ar, ag, ab) <= MARKER_TOLERANCE;
    const onlyGreen = facesCell.mean[0] <= MARKER_TOLERANCE && facesCell.mean[2] <= MARKER_TOLERANCE;
    const onlyBlue = flagsCell.mean[0] <= MARKER_TOLERANCE && flagsCell.mean[1] <= MARKER_TOLERANCE;
    if (!isGrey || !onlyGreen || !onlyBlue) return null;

    const flags = Math.round(flagsCell.mean[2] / FLAG_STEP) & 7;
    const decoded: Marker = {
      identity: identityFromRgb(identityCell.mean),
      // The age cell is neutral grey (red = green = blue = age); reading luma ignores chroma bleed.
      age: Math.round(luma(ageCell.mean)),
      faces: clampInt(Math.round(facesCell.mean[1] / FACE_STEP), 0, MAX_FACES),
      nsfw: (flags & FLAG_NSFW) !== 0,
      blurry: (flags & FLAG_BLURRY) !== 0,
      publicFigure: (flags & FLAG_PUBLIC_FIGURE) !== 0,
    };
    const pose = await decodePose(bytes, width, height, side);
    if (pose) decoded.pose = pose;
    return decoded;
  } catch {
    return null;
  }
}

/* ───────────── helpers ───────────── */

/** Pose cells (5-7) when present: a flat cyan sentinel followed by two neutral grey cells. */
async function decodePose(bytes: Uint8Array, width: number, height: number, side: number): Promise<MarkerPose | null> {
  if (side * (MARKER_CELL_COUNT + POSE_CELL_COUNT) > width || side > height) return null;
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(bytes, { autoOrient: true })
    .extract({ left: side * MARKER_CELL_COUNT, top: 0, width: side * POSE_CELL_COUNT, height: side })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [sentinel, yawCell, pitchCell] = Array.from({ length: POSE_CELL_COUNT }, (_, i) => cellStats(data, info, i * side, side));
  const isCyan = sentinel.mean.every((v, c) => Math.abs(v - CYAN[c]) <= MARKER_TOLERANCE) && Math.max(...sentinel.std) <= 30;
  if (!isCyan || !isNeutral(yawCell.mean) || !isNeutral(pitchCell.mean)) return null;
  const toAngle = (rgb: Rgb) => clampInt((luma(rgb) - 128) / POSE_SCALE, -MAX_MARKER_POSE, MAX_MARKER_POSE);
  return { yaw: toAngle(yawCell.mean), pitch: toAngle(pitchCell.mean) };
}

function isNeutral([r, g, b]: Rgb): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) <= MARKER_TOLERANCE;
}

function luma([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Mean + std-dev per RGB channel over the inner half of one cell (avoids resize/chroma bleed at edges). */
function cellStats(
  data: Buffer,
  info: { width: number; height: number; channels: number },
  left: number,
  side: number,
): { mean: Rgb; std: Rgb } {
  const inset = Math.floor(side / 4);
  const x0 = left + inset;
  const x1 = Math.min(info.width, left + side - inset);
  const y0 = inset;
  const y1 = Math.min(info.height, side - inset);
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * info.width + x) * info.channels;
      for (let c = 0; c < 3; c++) {
        const v = data[o + Math.min(c, info.channels - 1)];
        sum[c] += v;
        sq[c] += v * v;
      }
      n++;
    }
  }
  if (n === 0) return { mean: [0, 0, 0], std: [255, 255, 255] };
  const mean = sum.map((s) => s / n) as Rgb;
  const std = sq.map((s, c) => Math.sqrt(Math.max(0, s / n - mean[c] ** 2))) as Rgb;
  return { mean, std };
}

function identityFromRgb([r, g, b]: Rgb): MockIdentity {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 64 || (max - min) / max < 0.4) return "default";
  const d = max - min;
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return MOCK_IDENTITIES[Math.round(hue / 30) % MOCK_IDENTITIES.length];
}

/** Fully saturated, full-value colour for a hue in degrees. */
function hueToRgb(hue: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  const [r, g, b] =
    h < 60 ? [1, x, 0] : h < 120 ? [x, 1, 0] : h < 180 ? [0, 1, x] : h < 240 ? [0, x, 1] : h < 300 ? [x, 0, 1] : [1, 0, x];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));
}
