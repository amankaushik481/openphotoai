/**
 * Mock face provider. Faces, identity, age and flags come from the pixel marker
 * (see ./markers.ts); unmarked images contain one adult face of identity "default".
 *
 * - Embeddings: 128-d, L2-normalized. Every identity has a fixed base vector (all base
 *   vectors are mutually orthogonal), plus a small per-image jitter seeded by the image
 *   bytes: same identity ⇒ cosine ≈ 0.97, different identity ⇒ cosine ≈ 0.
 * - Pose: the marker's explicit pose cells when present (deterministic head-pose for liveness
 *   tests and the e2e fake camera); otherwise derived from a coarse perceptual signature of the
 *   pixels (4×4 block means), so it varies between photos but is stable under re-encoding/resizing.
 * - Box: centered 40% of the image (several faces are laid out side by side).
 */
import { createHash } from "node:crypto";
import type { DetectedFace, FaceProvider } from "../types";
import { DEFAULT_MARKER, decodeMarker, MOCK_IDENTITIES, type Marker } from "./markers";
import { hash32, mulberry32 } from "./random";

export const MOCK_EMBEDDING_DIM = 128;
export const MOCK_MATCH_THRESHOLD = 0.6;
/** Jitter magnitude relative to the unit base vector: cos(same identity) ≈ 1 / (1 + JITTER²). */
const JITTER = 0.15;
const MAX_YAW = 35;
const MAX_PITCH = 25;
const MAX_ROLL = 8;

export function createMockFaceProvider(): FaceProvider {
  return {
    name: "mock",
    matchThreshold: MOCK_MATCH_THRESHOLD,
    async analyze(bytes) {
      const sharp = (await import("sharp")).default;
      let width: number;
      let height: number;
      try {
        const meta = await sharp(bytes).metadata();
        width = meta.autoOrient?.width ?? meta.width ?? 0;
        height = meta.autoOrient?.height ?? meta.height ?? 0;
      } catch {
        throw new Error("Mock face provider: unsupported image");
      }
      if (!width || !height) throw new Error("Mock face provider: unsupported image");

      const marker: Marker = (await decodeMarker(bytes)) ?? { ...DEFAULT_MARKER };
      const imageSeed = createHash("sha256").update(bytes).digest("hex");
      const pose = marker.pose ? { ...marker.pose, roll: 0 } : await poseFromPixels(bytes);

      const faces: DetectedFace[] = Array.from({ length: marker.faces }, (_, i) => ({
        box: faceBox(width, height, i, marker.faces),
        confidence: i === 0 ? 0.99 : 0.95,
        embedding: mockFaceEmbedding(i === 0 ? marker.identity : `${marker.identity}:other-${i}`, `${imageSeed}:${i}`),
        age: marker.age,
        yaw: round1(i === 0 ? pose.yaw : -pose.yaw / 2),
        pitch: round1(i === 0 ? pose.pitch : pose.pitch / 2),
        roll: round1(pose.roll),
      }));
      return { faces, width, height };
    },
  };
}

/**
 * Embedding of a face of `identity` (any label; the known mock identities and "default"
 * are exactly orthogonal to each other). Without `jitterSeed` returns the base vector.
 */
export function mockFaceEmbedding(identity: string, jitterSeed?: string): number[] {
  const base = baseVector(identity);
  if (!jitterSeed) return base;
  const noise = normalize(gaussianVector(`jitter:${jitterSeed}`));
  return normalize(base.map((v, i) => v + JITTER * noise[i]));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/* ───────────── embeddings ───────────── */

let knownBasis: Map<string, number[]> | null = null;

/** Gram–Schmidt over the known identities so they are exactly orthogonal. */
function getKnownBasis(): Map<string, number[]> {
  if (knownBasis) return knownBasis;
  const basis = new Map<string, number[]>();
  for (const label of ["default", ...MOCK_IDENTITIES]) {
    basis.set(label, normalize(orthogonalize(gaussianVector(`identity:${label}`), [...basis.values()])));
  }
  knownBasis = basis;
  return basis;
}

function baseVector(identity: string): number[] {
  const basis = getKnownBasis();
  const known = basis.get(identity);
  if (known) return [...known];
  // Unknown labels (e.g. bystanders in group photos) are orthogonal to every known identity.
  return normalize(orthogonalize(gaussianVector(`identity:${identity}`), [...basis.values()]));
}

function orthogonalize(v: number[], basis: number[][]): number[] {
  const out = [...v];
  for (const b of basis) {
    const dot = out.reduce((s, x, i) => s + x * b[i], 0);
    for (let i = 0; i < out.length; i++) out[i] -= dot * b[i];
  }
  return out;
}

function gaussianVector(seed: string): number[] {
  const rand = mulberry32(hash32(seed));
  return Array.from({ length: MOCK_EMBEDDING_DIM }, () => {
    // Box–Muller
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/* ───────────── pose ───────────── */

/** Fixed per-cell weights in [0.25, 0.75) so the "hash" is continuous in the pixel values. */
const POSE_WEIGHTS = (() => {
  const rand = mulberry32(hash32("mock-face-pose"));
  return [0, 1, 2].map(() => Array.from({ length: 16 }, () => 0.25 + rand() * 0.5));
})();

/**
 * yaw ∈ [-35, 35] (negative = left), pitch ∈ [-25, 25] (positive = up), roll ∈ [-8, 8].
 * Each angle is a triangle wave over a weighted sum of 4×4 grey block means: different photos
 * land far apart, while re-encoding/resizing (block means shift by < 1) moves it < 1°.
 */
async function poseFromPixels(bytes: Uint8Array): Promise<{ yaw: number; pitch: number; roll: number }> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(bytes, { autoOrient: true })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(4, 4, { fit: "fill", kernel: "linear" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cells = Array.from({ length: 16 }, (_, i) => data[i] / 255);
  const [yaw, pitch, roll] = POSE_WEIGHTS.map((weights, k) => {
    const x = weights.reduce((s, w, i) => s + w * cells[i], 0) + k * 0.37;
    return triangle(x);
  });
  return { yaw: yaw * MAX_YAW, pitch: pitch * MAX_PITCH, roll: roll * MAX_ROLL };
}

/** Triangle wave with period 1 mapping to [-1, 1] (uniform for uniformly spread inputs). */
function triangle(x: number): number {
  const f = x - Math.floor(x);
  return 4 * Math.abs(f - 0.5) - 1;
}

/* ───────────── geometry + utils ───────────── */

function faceBox(width: number, height: number, index: number, count: number): DetectedFace["box"] {
  if (count <= 1) {
    return { x: Math.round(width * 0.3), y: Math.round(height * 0.3), width: Math.round(width * 0.4), height: Math.round(height * 0.4) };
  }
  const slot = (width * 0.8) / count;
  const w = Math.min(width * 0.4, slot * 0.8);
  const h = (w * height) / width;
  return {
    x: Math.round(width * 0.1 + slot * index + (slot - w) / 2),
    y: Math.round((height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
