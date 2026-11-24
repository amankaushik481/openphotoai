/**
 * Generates the committed test fixtures (deterministic):
 *
 *   tests/fixtures/selfies/*.jpg   synthetic 1024×1280 selfies carrying mock markers
 *   tests/fixtures/garment.jpg     T-shirt on a plain background (marker: 0 faces)
 *   tests/fixtures/reference-pose.jpg  another adult ("judy") in a pose
 *   tests/fixtures/mask.png        inpainting mask (white = repaint)
 *
 * The mock face/moderation providers read the markers (src/providers/mock/markers.ts).
 * alice-01..12 are picked so the set covers frontal/left/right/up/down head poses, are
 * mutually distinct (dHash) and sharp. Run: pnpm exec tsx scripts/generate-fixtures.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createMockFaceProvider } from "../src/providers/mock/face";
import { decodeMarker, encodeMarker, type Marker } from "../src/providers/mock/markers";
import { hash32, mulberry32 } from "../src/providers/mock/random";

const ROOT = path.resolve(import.meta.dirname, "..", "tests", "fixtures");
const SELFIE_W = 1024;
const SELFIE_H = 1280;
const MAX_BYTES = 150 * 1024;
const MIN_SHARPNESS = 150;
const MIN_DHASH_DISTANCE = 10;

type PoseBucket = "frontal" | "left" | "right" | "up" | "down";

interface SelfieSpec {
  name: string;
  marker: Partial<Marker>;
  faces?: number;
  blur?: number;
  brightness?: number;
  pose?: PoseBucket;
}

const ALICE: Partial<Marker> = { identity: "alice", age: 29 };
const ALICE_POSES: PoseBucket[] = ["frontal", "left", "right", "up", "down", "frontal", "left", "right", "up", "down", "frontal", "frontal"];

const SELFIES: SelfieSpec[] = [
  ...ALICE_POSES.map((pose, i) => ({ name: `alice-${String(i + 1).padStart(2, "0")}`, marker: ALICE, pose })),
  { name: "bob-01", marker: { identity: "bob", age: 34 } },
  { name: "teen-01", marker: { identity: "alice", age: 15 } },
  { name: "group-01", marker: { ...ALICE, faces: 2 }, faces: 2 },
  { name: "blurry-01", marker: { ...ALICE, blurry: true }, blur: 14 },
  { name: "dark-01", marker: ALICE, brightness: 0.16 },
  { name: "nsfw-01", marker: { ...ALICE, nsfw: true } },
  { name: "celebrity-01", marker: { identity: "oscar", age: 45, publicFigure: true } },
];

const face = createMockFaceProvider();

async function main() {
  await mkdir(path.join(ROOT, "selfies"), { recursive: true });
  const hashes: string[] = [];
  for (const spec of SELFIES) {
    const { bytes, seed, pose } = await findSelfie(spec, hashes);
    const out = path.join(ROOT, "selfies", `${spec.name}.jpg`);
    await writeFile(out, bytes);
    const m = await metrics(bytes);
    console.log(
      `${spec.name.padEnd(13)} ${kb(bytes)}  seed=${seed}  sharp=${m.sharpness.toFixed(0)} bright=${m.brightness.toFixed(0)}` +
        (pose ? `  yaw=${pose.yaw} pitch=${pose.pitch}` : ""),
    );
  }

  const garment = await finish(await renderGarment(), { faces: 0 });
  await writeFile(path.join(ROOT, "garment.jpg"), garment);
  const pose = await finish(await renderReferencePose(), { identity: "judy", age: 31 });
  await writeFile(path.join(ROOT, "reference-pose.jpg"), pose);
  const mask = await renderMask();
  await writeFile(path.join(ROOT, "mask.png"), mask);
  console.log(`garment.jpg ${kb(garment)}  reference-pose.jpg ${kb(pose)}  mask.png ${kb(mask)}`);
}

/** Try seeds until the selfie meets its pose target, size budget, sharpness and distinctness. */
async function findSelfie(spec: SelfieSpec, acceptedHashes: string[]) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const seed = hash32(`${spec.name}:${attempt}`);
    if (spec.pose && !(await previewMatches(spec, seed, acceptedHashes))) continue;
    const bytes = await renderSelfie(spec, seed);
    if (bytes.byteLength > MAX_BYTES) continue;
    const marker = await decodeMarker(bytes);
    if (!marker) throw new Error(`${spec.name}: marker did not decode`);

    if (!spec.blur && !spec.brightness && (await metrics(bytes)).sharpness < MIN_SHARPNESS) continue;
    let pose: { yaw: number; pitch: number } | undefined;
    if (spec.pose) {
      pose = await stablePose(bytes, spec.pose);
      if (!pose) continue;
      const hash = await dHash(bytes);
      if (acceptedHashes.some((h) => hamming(h, hash) < MIN_DHASH_DISTANCE)) continue;
      acceptedHashes.push(hash);
    }
    return { bytes, seed, pose };
  }
  throw new Error(`${spec.name}: no suitable variant found`);
}

/** Cheap 1/8-scale render: pose (4×4 block means) and dHash barely depend on resolution or noise. */
async function previewMatches(spec: SelfieSpec, seed: number, acceptedHashes: string[]): Promise<boolean> {
  const svg = selfieSvg(mulberry32(seed), spec.faces ?? 1).replace(
    `width="${SELFIE_W}" height="${SELFIE_H}"`,
    `width="${SELFIE_W / 8}" height="${SELFIE_H / 8}"`,
  );
  const preview = await (await encodeMarker(sharp(Buffer.from(svg)).removeAlpha(), spec.marker)).png().toBuffer();
  const f = (await face.analyze(new Uint8Array(preview))).faces[0];
  if (!spec.pose || !inBucket({ yaw: f.yaw ?? 0, pitch: f.pitch ?? 0 }, spec.pose, 2)) return false;
  const hash = await dHash(new Uint8Array(preview));
  return !acceptedHashes.some((h) => hamming(h, hash) < MIN_DHASH_DISTANCE - 2);
}

/** Pose of the photo, if it is inside `bucket` with margin and stays there after re-encode + resize. */
async function stablePose(bytes: Uint8Array, bucket: PoseBucket) {
  const variants = [
    bytes,
    await sharp(bytes).jpeg({ quality: 88 }).toBuffer(),
    await sharp(bytes).resize(768).jpeg({ quality: 82 }).toBuffer(),
  ];
  let first: { yaw: number; pitch: number } | undefined;
  for (const v of variants) {
    const f = (await face.analyze(new Uint8Array(v))).faces[0];
    const p = { yaw: f.yaw ?? 0, pitch: f.pitch ?? 0 };
    if (!inBucket(p, bucket)) return undefined;
    first ??= p;
  }
  return first;
}

/** Conservative buckets (well inside any reasonable frontal/left/right/up/down split). */
function inBucket({ yaw, pitch }: { yaw: number; pitch: number }, bucket: PoseBucket, slack = 0): boolean {
  switch (bucket) {
    case "frontal":
      return Math.abs(yaw) <= 7 + slack && Math.abs(pitch) <= 6 + slack;
    case "left":
      return yaw <= -22 + slack && Math.abs(pitch) <= 8 + slack;
    case "right":
      return yaw >= 22 - slack && Math.abs(pitch) <= 8 + slack;
    case "up":
      return pitch >= 15 - slack && Math.abs(yaw) <= 8 + slack;
    case "down":
      return pitch <= -15 + slack && Math.abs(yaw) <= 8 + slack;
  }
}

/* ───────────── rendering ───────────── */

const SKIN = ["#f1c9a5", "#e0ac83", "#c68642", "#a86b3c", "#8d5524", "#f3d1b5"];
const HAIR = ["#2b1b12", "#3b2416", "#111111", "#6b4423", "#a5753f", "#1f1a17"];

async function renderSelfie(spec: SelfieSpec, seed: number): Promise<Uint8Array> {
  const rand = mulberry32(seed);
  const svg = selfieSvg(rand, spec.faces ?? 1);
  let raw = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
  addLumaNoise(raw, 4.5, rand);
  let img = sharp(raw, { raw: { width: SELFIE_W, height: SELFIE_H, channels: 3 } });
  if (spec.blur) img = img.blur(spec.blur);
  if (spec.brightness) img = img.linear(spec.brightness, 0);
  raw = await img.raw().toBuffer();
  return finish(sharp(raw, { raw: { width: SELFIE_W, height: SELFIE_H, channels: 3 } }), spec.marker);
}

function selfieSvg(rand: () => number, faces: number): string {
  const W = SELFIE_W;
  const H = SELFIE_H;
  const hue = rand() * 360;
  const room = Array.from({ length: 4 + Math.floor(rand() * 4) }, () => {
    const w = W * (0.12 + rand() * 0.35);
    const h = H * (0.1 + rand() * 0.4);
    const light = rand() > 0.5;
    return `<rect x="${(rand() * (W - w)).toFixed(0)}" y="${(rand() * H * 0.55).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${hsl(hue + rand() * 80 - 40, 20 + rand() * 30, light ? 78 : 30)}" fill-opacity="${(0.45 + rand() * 0.45).toFixed(2)}"/>`;
  }).join("");
  const lines = Array.from({ length: 3 }, () => {
    const x = (rand() * W).toFixed(0);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${hsl(hue, 15, rand() > 0.5 ? 85 : 20)}" stroke-width="${(4 + rand() * 10).toFixed(0)}" stroke-opacity="0.6"/>`;
  }).join("");

  const people = Array.from({ length: faces }, (_, i) => {
    const scale = faces > 1 ? 0.72 : 0.9 + rand() * 0.2;
    const cx = (W * (i + 1)) / (faces + 1) + (faces === 1 ? (rand() - 0.5) * 0.16 * W : 0);
    const cy = H * (0.4 + (rand() - 0.5) * 0.1);
    return person(cx, cy, scale, rand);
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="bg" x1="${rand().toFixed(2)}" y1="0" x2="${rand().toFixed(2)}" y2="1"><stop offset="0" stop-color="${hsl(hue, 28, 72)}"/><stop offset="1" stop-color="${hsl(hue + 35, 30, 40)}"/></linearGradient>
<radialGradient id="faceShade" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient>
<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="url(#bg)"/>${room}${lines}${people}
<rect width="100%" height="100%" fill="url(#vignette)"/>
</svg>`;
}

function person(cx: number, cy: number, s: number, rand: () => number): string {
  const W = SELFIE_W;
  const H = SELFIE_H;
  const rx = 0.17 * W * s;
  const ry = 0.22 * W * s;
  const skin = SKIN[Math.floor(rand() * SKIN.length)];
  const hair = HAIR[Math.floor(rand() * HAIR.length)];
  const garment = hsl(rand() * 360, 35 + rand() * 30, 25 + rand() * 35);
  const sy = cy + ry * 0.95;
  const eyeY = cy - ry * 0.12;
  const eyeDx = rx * 0.42;
  return `<g>
<path d="M ${cx - 0.5 * W * s} ${H} Q ${cx - 0.48 * W * s} ${sy + 0.12 * W * s} ${cx - 0.14 * W * s} ${sy} L ${cx + 0.14 * W * s} ${sy} Q ${cx + 0.48 * W * s} ${sy + 0.12 * W * s} ${cx + 0.5 * W * s} ${H} Z" fill="${garment}"/>
<rect x="${cx - rx * 0.38}" y="${cy + ry * 0.6}" width="${rx * 0.76}" height="${ry * 0.55}" fill="${skin}"/>
<ellipse cx="${cx}" cy="${cy - ry * 0.12}" rx="${rx * 1.13}" ry="${ry * 1.02}" fill="${hair}"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${skin}"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#faceShade)"/>
<path d="M ${cx - rx * 1.05} ${cy - ry * 0.35} Q ${cx} ${cy - ry * 1.25} ${cx + rx * 1.05} ${cy - ry * 0.35} Q ${cx} ${cy - ry * 0.8} ${cx - rx * 1.05} ${cy - ry * 0.35} Z" fill="${hair}"/>
${[-1, 1]
  .map(
    (d) => `<ellipse cx="${cx + d * eyeDx}" cy="${eyeY}" rx="${rx * 0.17}" ry="${ry * 0.075}" fill="#f8f4ef"/>
<circle cx="${cx + d * eyeDx}" cy="${eyeY}" r="${ry * 0.06}" fill="#3a2a1f"/>
<circle cx="${cx + d * eyeDx}" cy="${eyeY}" r="${ry * 0.028}" fill="#000"/>
<path d="M ${cx + d * eyeDx - rx * 0.2} ${eyeY - ry * 0.14} Q ${cx + d * eyeDx} ${eyeY - ry * 0.2} ${cx + d * eyeDx + rx * 0.2} ${eyeY - ry * 0.14}" stroke="${hair}" stroke-width="${ry * 0.035}" fill="none"/>`,
  )
  .join("")}
<path d="M ${cx} ${cy - ry * 0.02} L ${cx - rx * 0.1} ${cy + ry * 0.25} Q ${cx} ${cy + ry * 0.3} ${cx + rx * 0.08} ${cy + ry * 0.26}" stroke="#000" stroke-opacity="0.25" stroke-width="${ry * 0.02}" fill="none"/>
<path d="M ${cx - rx * 0.32} ${cy + ry * 0.45} Q ${cx} ${cy + ry * (0.55 + rand() * 0.1)} ${cx + rx * 0.32} ${cy + ry * 0.45}" stroke="#9e4a4a" stroke-width="${ry * 0.04}" fill="none" stroke-linecap="round"/>
</g>`;
}

async function renderGarment(): Promise<sharp.Sharp> {
  const W = 768;
  const H = 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f6fb5"/><stop offset="1" stop-color="#2a4f86"/></linearGradient></defs>
<rect width="100%" height="100%" fill="#f2f0ec"/>
<path d="M 250 170 L 330 140 Q 384 190 438 140 L 518 170 L 650 300 L 570 380 L 520 330 L 520 860 L 248 860 L 248 330 L 198 380 L 118 300 Z" fill="url(#g)" stroke="#1d3a63" stroke-width="4"/>
<path d="M 330 140 Q 384 200 438 140" stroke="#1d3a63" stroke-width="10" fill="none"/>
<text x="384" y="520" font-family="Inter, 'DejaVu Sans', sans-serif" font-size="56" font-weight="700" fill="#f2f0ec" text-anchor="middle">OPEN</text>
</svg>`;
  const raw = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
  addLumaNoise(raw, 3, mulberry32(hash32("garment")));
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } });
}

async function renderReferencePose(): Promise<sharp.Sharp> {
  const W = 1024;
  const H = 1280;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8de"/><stop offset="0.65" stop-color="#e9d3b0"/><stop offset="0.66" stop-color="#c9a879"/><stop offset="1" stop-color="#a7865a"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#sky)"/>
<circle cx="800" cy="260" r="90" fill="#fff4d6" fill-opacity="0.8"/>
<g stroke="#2d2a32" stroke-linecap="round" fill="none">
<path d="M 512 470 L 500 800" stroke-width="120"/>
<path d="M 470 520 L 330 640 L 260 470" stroke-width="44"/>
<path d="M 550 520 L 690 620 L 760 760" stroke-width="44"/>
<path d="M 480 790 L 420 1060 L 380 1240" stroke-width="58"/>
<path d="M 530 790 L 620 1040 L 700 1230" stroke-width="58"/>
</g>
<ellipse cx="512" cy="380" rx="78" ry="98" fill="#c99a76"/>
<path d="M 432 360 Q 512 250 592 360 Q 512 300 432 360 Z" fill="#2b1b12"/>
</svg>`;
  const raw = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
  addLumaNoise(raw, 4, mulberry32(hash32("reference-pose")));
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } });
}

async function renderMask(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SELFIE_W}" height="${SELFIE_H}" viewBox="0 0 ${SELFIE_W} ${SELFIE_H}">
<rect width="100%" height="100%" fill="#000"/>
<ellipse cx="512" cy="1060" rx="400" ry="260" fill="#fff"/>
</svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).greyscale().png({ palette: true, colours: 2 }).toBuffer());
}

/** Stamp the marker and encode (mozjpeg keeps the noisy selfies under the size budget). */
async function finish(img: sharp.Sharp, marker: Partial<Marker>): Promise<Uint8Array> {
  const marked = await encodeMarker(img, marker);
  return new Uint8Array(await marked.jpeg({ quality: 80, mozjpeg: true }).toBuffer());
}

/* ───────────── pixel helpers + checks ───────────── */

/** Approximately Gaussian luminance noise (same offset on R, G, B) so the blur check sees texture. */
function addLumaNoise(raw: Buffer, sigma: number, rand: () => number) {
  for (let i = 0; i < raw.length; i += 3) {
    const n = (rand() + rand() + rand() - 1.5) * 2 * sigma;
    for (let c = 0; c < 3; c++) raw[i + c] = Math.max(0, Math.min(255, Math.round(raw[i + c] + n)));
  }
}

/** Same measurements as imageMetrics() in src/server/images/process.ts (grey, ≤512px). */
async function metrics(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .greyscale()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += data[i];
  let lSum = 0;
  let lSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      lSum += l;
      lSq += l * l;
      n++;
    }
  }
  return { brightness: sum / (w * h), sharpness: lSq / n - (lSum / n) ** 2 };
}

async function dHash(bytes: Uint8Array): Promise<string> {
  const data = await sharp(bytes).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  return bits;
}

function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${(((h % 360) + 360) % 360).toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

function kb(b: Uint8Array): string {
  return `${(b.byteLength / 1024).toFixed(0)}KB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
