/**
 * Synthetic selfies for demo accounts, rendered at runtime with the mock AI provider's portrait
 * renderer (test fixtures are not shipped in production images). Demo mode always runs on mock
 * providers: an unmarked image is one adult face of the mock "default" identity, so the consent
 * selfie and the training photos match each other and go through the real quality + safety checks.
 *
 * Rendering is deterministic, so the set is built once per process and reused for every demo user.
 */
import type { MockPayload } from "@/providers/mock/payload";
import { hash32, mulberry32 } from "@/providers/mock/random";

/** Consent selfie + training photos (instant mode needs 3; the provider gets up to 4 references). */
export const DEMO_SELFIE_COUNT = 5;
const LONG_SIDE = 1024;
/** Luma noise: the flat SVG art alone is far too smooth for the sharpness check. */
const NOISE_SIGMA = 5;
const JPEG_QUALITY = 88;
/** dHash distance between any two selfies, well above the duplicate threshold (6 of 64 bits). */
const MIN_HASH_DISTANCE = 12;
const MAX_CANDIDATES = 200;

let cached: Promise<Uint8Array[]> | undefined;

/** JPEG bytes of the demo selfies (the first one is the consent selfie). */
export function demoSelfies(): Promise<Uint8Array[]> {
  cached ??= renderSet().catch((err: unknown) => {
    cached = undefined; // retry on the next call instead of caching a failure
    throw err;
  });
  return cached;
}

async function renderSet(): Promise<Uint8Array[]> {
  const { hammingDistance, perceptualHash } = await import("@/server/images/process");
  const selfies: Uint8Array[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < MAX_CANDIDATES && selfies.length < DEMO_SELFIE_COUNT; i++) {
    const bytes = await renderSelfie(hash32(`demo-selfie:${i}`) % 1_000_000);
    const hash = await perceptualHash(bytes);
    if (hashes.some((h) => hammingDistance(h, hash) < MIN_HASH_DISTANCE)) continue;
    selfies.push(bytes);
    hashes.push(hash);
  }
  if (selfies.length < DEMO_SELFIE_COUNT) throw new Error("couldn't render enough distinct demo selfies");
  return selfies;
}

async function renderSelfie(seed: number): Promise<Uint8Array> {
  const [{ default: sharp }, { renderMockImage }] = await Promise.all([
    import("sharp"),
    import("@/providers/mock/render"),
  ]);
  const payload: MockPayload = {
    k: "gen",
    p: "Demo selfie",
    ar: "4:5",
    n: 1,
    q: "standard",
    L: LONG_SIDE,
    s: seed,
    f: 0,
    r: "",
  };
  const png = await renderMockImage(payload, 0);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  addLumaNoise(data, mulberry32(seed));
  const jpeg = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return new Uint8Array(jpeg);
}

/** Same gaussian offset on every channel of a pixel (grain, not colour noise). */
function addLumaNoise(rgb: Buffer, rand: () => number): void {
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const u = Math.max(rand(), 1e-12);
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()) * NOISE_SIGMA;
    for (let c = 0; c < 3; c++) rgb[i + c] = Math.min(255, Math.max(0, Math.round(rgb[i + c]! + n)));
  }
}
