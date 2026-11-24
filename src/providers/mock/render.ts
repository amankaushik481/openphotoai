/**
 * Synthesizes mock provider outputs: PNG "portraits" (SVG → sharp) and small H.264 MP4 clips
 * (sharp frames → ffmpeg-static). Deterministic for a given payload + index.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeMarker, isDefaultMarker, normalizeMarker, paintMarkerRaw, type Marker } from "./markers";
import { FLAG_NSFW, outputSize, type MockPayload } from "./payload";
import { hash32, mulberry32 } from "./random";

export const MOCK_VIDEO_SECONDS = 3;
const VIDEO_FPS = 24;
const VIDEO_LONG_SIDE = 512;
const VIDEO_ZOOM = 1.12;

/** Marker stamped on outputs, or null when the output is a plain default image. */
export function outputMarker(payload: MockPayload): Marker | null {
  const marker = normalizeMarker({
    identity: (payload.id ?? "default") as Marker["identity"],
    faces: payload.fc ?? 1,
    nsfw: (payload.f & FLAG_NSFW) !== 0,
  });
  return isDefaultMarker(marker) ? null : marker;
}

export async function renderMockImage(payload: MockPayload, index: number): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  const { width, height } = outputSize(payload.ar, payload.L);
  const svg = portraitSvg(payload, index, width, height, { caption: true });
  let image = sharp(Buffer.from(svg));
  const marker = outputMarker(payload);
  if (marker) image = await encodeMarker(image, marker);
  return new Uint8Array(await image.png({ compressionLevel: 8 }).toBuffer());
}

/** ~3s, yuv420p H.264 MP4 with a slow zoom. Cached per payload in the OS temp dir. */
export async function renderMockVideo(payload: MockPayload, encoded: string): Promise<Uint8Array> {
  const cacheFile = join(tmpdir(), `openshoot-mock-video-${createHash("sha256").update(encoded).digest("hex").slice(0, 32)}.mp4`);
  try {
    return new Uint8Array(await readFile(cacheFile));
  } catch {
    // not cached yet
  }

  const sharp = (await import("sharp")).default;
  const { width, height } = outputSize(payload.ar, VIDEO_LONG_SIDE);
  const baseW = Math.ceil(width * VIDEO_ZOOM);
  const baseH = Math.ceil(height * VIDEO_ZOOM);
  const base = await sharp(Buffer.from(portraitSvg(payload, 0, baseW, baseH, { caption: false })))
    .removeAlpha()
    .raw()
    .toBuffer();
  const caption = await sharp(Buffer.from(captionSvg(payload, width, height))).png().toBuffer();
  const marker = outputMarker(payload);

  const tmpOut = `${cacheFile}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const ffmpeg = spawn(
    await ffmpegBinary(),
    [
      ...["-hide_banner", "-loglevel", "error", "-y"],
      ...["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(VIDEO_FPS), "-i", "pipe:0"],
      ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
      ...["-an", "-f", "mp4", tmpOut],
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  ffmpeg.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  const exited = once(ffmpeg, "close") as Promise<[number | null]>;
  // Without a listener an EPIPE (ffmpeg died early) would crash the process; the exit code reports it.
  ffmpeg.stdin.on("error", () => {});

  try {
    const frames = VIDEO_FPS * MOCK_VIDEO_SECONDS;
    for (let f = 0; f < frames; f++) {
      const zoom = 1 + ((VIDEO_ZOOM - 1) * f) / (frames - 1);
      const winW = Math.min(baseW, Math.round(baseW / zoom));
      const winH = Math.min(baseH, Math.round(baseH / zoom));
      const frame = await sharp(base, { raw: { width: baseW, height: baseH, channels: 3 } })
        .extract({ left: Math.floor((baseW - winW) / 2), top: Math.floor((baseH - winH) / 2), width: winW, height: winH })
        .resize(width, height, { fit: "fill" })
        .composite([{ input: caption }])
        .removeAlpha()
        .raw()
        .toBuffer();
      const pixels = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
      if (marker) paintMarkerRaw(pixels, { width, height, channels: 3 }, marker);
      if (!ffmpeg.stdin.write(pixels)) await Promise.race([once(ffmpeg.stdin, "drain"), exited]);
      if (ffmpeg.exitCode !== null) break;
    }
    ffmpeg.stdin.end();
    const [code] = await exited;
    if (code !== 0) throw new Error(`Mock video encoding failed (ffmpeg exit ${code}): ${stderr.trim().slice(0, 300)}`);
    await rename(tmpOut, cacheFile);
    return new Uint8Array(await readFile(cacheFile));
  } finally {
    if (ffmpeg.exitCode === null) ffmpeg.kill("SIGKILL");
    await rm(tmpOut, { force: true });
  }
}

async function ffmpegBinary(): Promise<string> {
  const mod = await import("ffmpeg-static");
  return mod.default ?? "ffmpeg";
}

/* ───────────── SVG art ───────────── */

interface Palette {
  bgA: string;
  bgB: string;
  garment: string;
  hair: string;
  skin: string;
}

function palette(payload: MockPayload, index: number): Palette {
  // Output i of a job with seed s renders like output 0 of seed s+i (same seed ⇒ same picture).
  const hue = hash32(`${payload.p}|${payload.s + index}`) % 360;
  return {
    bgA: hsl(hue, 58, 74),
    bgB: hsl(hue + 38, 46, 34),
    garment: hsl(hue + 165, 32, 30),
    hair: hsl(hue + 200, 18, 16),
    skin: hsl(24 + (hash32(payload.id ?? "default") % 14), 38, 62),
  };
}

/** Abstract portrait: soft gradient, bokeh, glow and one silhouette per face. */
function portraitSvg(payload: MockPayload, index: number, width: number, height: number, opts: { caption: boolean }): string {
  const rand = mulberry32(hash32(`${payload.p}|${payload.s + index}|layout`));
  const pal = palette(payload, index);
  const u = Math.min(width, height);
  const transparent = payload.k === "rmbg";
  const faces = Math.max(1, payload.fc ?? 1);

  const bokeh = transparent
    ? ""
    : Array.from({ length: 9 }, () => {
        const r = u * (0.03 + rand() * 0.1);
        return `<circle cx="${f1(rand() * width)}" cy="${f1(rand() * height * 0.7)}" r="${f1(r)}" fill="#fff" fill-opacity="${(0.05 + rand() * 0.14).toFixed(2)}"/>`;
      }).join("");

  const figures = Array.from({ length: faces }, (_, i) => {
    const scale = faces > 1 ? 0.78 : 1;
    const cx = (width * (i + 1)) / (faces + 1) + (faces === 1 ? (rand() - 0.5) * 0.12 * width : 0);
    return silhouette(cx, height, u * scale, pal);
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="${f1(0.6 + rand() * 0.4)}" y2="1"><stop offset="0" stop-color="${pal.bgA}"/><stop offset="1" stop-color="${pal.bgB}"/></linearGradient>
<radialGradient id="glow" cx="${f1(0.2 + rand() * 0.6)}" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
</defs>
${transparent ? "" : `<rect width="100%" height="100%" fill="url(#bg)"/>${bokeh}<rect width="100%" height="100%" fill="url(#glow)"/>`}
${figures}
${transparent ? "" : `<rect width="100%" height="100%" fill="url(#shade)"/>`}
${opts.caption ? captionMarkup(payload, width, height) : ""}
</svg>`;
}

function silhouette(cx: number, height: number, u: number, pal: Palette): string {
  const headRx = 0.115 * u;
  const headRy = 0.145 * u;
  const headCy = height - 0.62 * u;
  const shoulderY = headCy + headRy + 0.06 * u;
  const body = [
    `M ${f1(cx - 0.4 * u)} ${height}`,
    `L ${f1(cx - 0.36 * u)} ${f1(shoulderY + 0.12 * u)}`,
    `Q ${f1(cx - 0.33 * u)} ${f1(shoulderY)} ${f1(cx - 0.12 * u)} ${f1(shoulderY - 0.01 * u)}`,
    `L ${f1(cx + 0.12 * u)} ${f1(shoulderY - 0.01 * u)}`,
    `Q ${f1(cx + 0.33 * u)} ${f1(shoulderY)} ${f1(cx + 0.36 * u)} ${f1(shoulderY + 0.12 * u)}`,
    `L ${f1(cx + 0.4 * u)} ${height} Z`,
  ].join(" ");
  return `<g>
<rect x="${f1(cx - 0.045 * u)}" y="${f1(headCy + headRy * 0.6)}" width="${f1(0.09 * u)}" height="${f1(0.12 * u)}" fill="${pal.skin}" fill-opacity="0.92"/>
<path d="${body}" fill="${pal.garment}" stroke="#fff" stroke-opacity="0.18" stroke-width="${f1(0.006 * u)}"/>
<ellipse cx="${f1(cx)}" cy="${f1(headCy - 0.035 * u)}" rx="${f1(headRx * 1.12)}" ry="${f1(headRy * 1.02)}" fill="${pal.hair}"/>
<ellipse cx="${f1(cx)}" cy="${f1(headCy + 0.012 * u)}" rx="${f1(headRx)}" ry="${f1(headRy * 0.94)}" fill="${pal.skin}" stroke="#fff" stroke-opacity="0.22" stroke-width="${f1(0.005 * u)}"/>
</g>`;
}

function captionMarkup(payload: MockPayload, width: number, height: number): string {
  const fs = Math.max(10, Math.round(width * 0.028));
  const pad = Math.round(width * 0.04);
  const boxH = Math.round(fs * 2.9);
  const y = height - pad - boxH;
  const maxChars = Math.max(8, Math.floor((width - 4 * pad) / (fs * 0.56)));
  const text = payload.p ? truncate(payload.p, maxChars) : labelFor(payload);
  return `<g font-family="Inter, 'DejaVu Sans', Arial, sans-serif">
<rect x="${pad}" y="${y}" width="${width - 2 * pad}" height="${boxH}" rx="${Math.round(fs * 0.6)}" fill="#000" fill-opacity="0.38"/>
<text x="${pad + fs}" y="${f1(y + fs * 1.3)}" font-size="${fs}" fill="#fff">${escapeXml(text)}</text>
<text x="${pad + fs}" y="${f1(y + fs * 2.4)}" font-size="${Math.round(fs * 0.72)}" fill="#fff" fill-opacity="0.8">OpenShoot · mock</text>
</g>`;
}

function captionSvg(payload: MockPayload, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${captionMarkup(payload, width, height)}</svg>`;
}

function labelFor(payload: MockPayload): string {
  const labels: Record<MockPayload["k"], string> = {
    gen: "Generated photo",
    edit: "Edited photo",
    pose: "Pose copy",
    multi: "Together photo",
    inpaint: "Inpainted photo",
    upscale: "Upscaled photo",
    restore: "Face restored",
    rmbg: "Background removed",
    tryon: "Virtual try-on",
    train: "Training",
    i2v: "Photo to video",
    talk: "Talking video",
  };
  return labels[payload.k];
}

/* ───────────── utils ───────────── */

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function f1(n: number): string {
  return n.toFixed(1);
}

function hsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number) => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
