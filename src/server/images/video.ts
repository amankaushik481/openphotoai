/**
 * Video helpers on the ffmpeg-static binary (no system ffmpeg needed): probing, frame extraction and
 * rewriting outputs as faststart MP4 with AI-label metadata and an optional burned-in watermark.
 *
 * Paths and the binary are runtime values: `turbopackIgnore` keeps the bundler from tracing them
 * (it would otherwise pull the whole project into the server trace).
 */
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { AppError } from "@/server/http";

const FFMPEG_TIMEOUT_MS = 60_000;
/** Re-encoding (watermark) is much slower than probing or stream copies. */
const FFMPEG_ENCODE_TIMEOUT_MS = 5 * 60_000;
const MAX_STDERR = 64 * 1024;
const MAX_FRAMES = 30;

function resolveFfmpeg(): string {
  if (!ffmpegPath || !existsSync(/* turbopackIgnore: true */ ffmpegPath)) {
    throw new Error("ffmpeg binary not found: the ffmpeg-static package is missing or unsupported on this platform");
  }
  return ffmpegPath;
}

function runFfmpeg(bin: string, args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_STDERR) stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/** Run `work` with a private temp dir that is always removed afterwards. */
async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(/* turbopackIgnore: true */ os.tmpdir(), "openshoot-video-"));
  try {
    return await work(dir);
  } finally {
    await fs.rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}

const tempFile = (dir: string, name: string) => path.join(/* turbopackIgnore: true */ dir, name);

/** `ffmpeg -i` without an output exits non-zero but prints the container + stream info. */
async function inspect(bin: string, file: string): Promise<string> {
  return (await runFfmpeg(bin, ["-hide_banner", "-nostdin", "-i", file])).stderr;
}

export interface VideoProbe {
  durationSec: number;
  width: number;
  height: number;
}

/** Parse `ffmpeg -i` stderr: duration, display size (rotation-aware). Null when there is no video stream. */
export function parseFfmpegProbe(stderr: string): VideoProbe | null {
  const stream = /Stream #\d+:\d+[^\n]*?: Video: [^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  if (!stream) return null;
  let width = Number(stream[1]);
  let height = Number(stream[2]);
  const rotation = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  if (rotation && Math.abs(Math.round(Number(rotation[1]))) % 180 === 90) [width, height] = [height, width];
  const d = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationSec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  return { durationSec, width, height };
}

/**
 * Container-level metadata tags from `ffmpeg -i` stderr (the first input's `Metadata:` block, before
 * any stream). Keys are lower-cased; continuation lines of multi-line values are joined with "\n".
 */
export function parseFfmpegMetadata(stderr: string): Record<string, string> {
  const lines = stderr.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s{2}Metadata:\s*$/.test(l));
  const tags: Record<string, string> = {};
  if (start < 0) return tags;
  let last: string | null = null;
  for (const line of lines.slice(start + 1)) {
    // Continuation lines of a multi-line value are printed as "<spaces>: value".
    const cont = /^\s{5,}:\s?(.*)$/.exec(line);
    if (cont && last) {
      tags[last] += `\n${cont[1]}`;
      continue;
    }
    const m = /^\s{4}(\S[^:]*?)\s*:\s?(.*)$/.exec(line);
    if (!m) break;
    last = m[1]!.trim().toLowerCase();
    tags[last] = m[2]!;
  }
  return tags;
}

/** Probe a video and extract `count` evenly spaced JPEG frames (the first one at t=0). */
export async function extractFrames(
  video: Uint8Array,
  count = 3,
): Promise<{ durationSec: number; width: number; height: number; frames: Uint8Array[] }> {
  const bin = resolveFfmpeg();
  const n = Math.min(Math.max(Math.floor(count), 1), MAX_FRAMES);
  return withTempDir(async (dir) => {
    const input = tempFile(dir, "input");
    await fs.writeFile(/* turbopackIgnore: true */ input, video);

    const probe = parseFfmpegProbe(await inspect(bin, input));
    if (!probe) throw new AppError("validation_error", "We couldn't read this video.");

    const frames: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      const at = (probe.durationSec * i) / n;
      const out = tempFile(dir, `frame-${i}.jpg`);
      const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-ss", at.toFixed(3), "-i", input];
      await runFfmpeg(bin, [...args, "-frames:v", "1", "-q:v", "3", "-f", "image2", out]);
      // A seek past the last decodable frame yields no output; skip it rather than fail.
      const bytes = await fs.readFile(/* turbopackIgnore: true */ out).catch(() => null);
      if (bytes && bytes.length > 0) frames.push(bytes);
    }
    if (frames.length === 0) throw new AppError("validation_error", "We couldn't read this video.");
    return { ...probe, frames };
  });
}

/** Container metadata tags of a video (see parseFfmpegMetadata). Empty when unreadable. */
export async function readVideoMetadata(video: Uint8Array): Promise<Record<string, string>> {
  const bin = resolveFfmpeg();
  return withTempDir(async (dir) => {
    const input = tempFile(dir, "input");
    await fs.writeFile(/* turbopackIgnore: true */ input, video);
    return parseFfmpegMetadata(await inspect(bin, input));
  });
}

export interface VideoOverlay {
  /** Transparent PNG burned into the bottom-right corner. */
  png: Uint8Array;
  /** Distance from the right and bottom edges, in pixels. */
  margin: number;
}

export interface FinalizeVideoOptions {
  /** Container metadata tags (`-metadata key=value`), e.g. comment / description / creation_time. */
  metadata: Record<string, string>;
  /** Builds the corner overlay for the probed display size; null (e.g. a tiny video) skips it. */
  overlay?: (size: VideoProbe) => Promise<VideoOverlay | null>;
}

export interface FinalizedVideo {
  bytes: Uint8Array;
  mimeType: "video/mp4";
  /** True when the overlay was burned in. */
  overlaid: boolean;
  probe: VideoProbe;
}

const METADATA_KEY = /^[a-z][a-z0-9_]{0,63}$/;

function metadataArgs(metadata: Record<string, string>): string[] {
  return Object.entries(metadata).flatMap(([key, value]) => {
    if (!METADATA_KEY.test(key)) throw new Error(`invalid video metadata key: ${key}`);
    // Control characters would corrupt the tag; ffmpeg passes the value through verbatim otherwise.
    return ["-metadata", `${key}=${value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim()}`];
  });
}

/**
 * Rewrite a video as a faststart MP4 carrying `metadata`. Without an overlay the streams are copied
 * (`-c copy`, no quality loss); with one the video is re-encoded (H.264 yuv420p, CRF 23) and audio is
 * copied. Each mode falls back to a full re-encode (H.264 + AAC) when the streams can't be copied
 * into MP4. Throws when ffmpeg can't produce a playable file.
 */
export async function finalizeVideo(video: Uint8Array, opts: FinalizeVideoOptions): Promise<FinalizedVideo> {
  const bin = resolveFfmpeg();
  const meta = metadataArgs(opts.metadata);
  return withTempDir(async (dir) => {
    const input = tempFile(dir, "input");
    const output = tempFile(dir, "output.mp4");
    await fs.writeFile(/* turbopackIgnore: true */ input, video);
    const probe = parseFfmpegProbe(await inspect(bin, input));
    if (!probe) throw new AppError("validation_error", "We couldn't read this video.");

    const overlay = opts.overlay ? await opts.overlay(probe) : null;
    const head = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", input];
    const tail = [...meta, "-movflags", "+faststart", "-f", "mp4", output];
    const x264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"];
    const aac = ["-c:a", "aac", "-b:a", "128k"];

    let attempts: { args: string[]; timeoutMs: number }[];
    if (overlay) {
      const png = tempFile(dir, "overlay.png");
      await fs.writeFile(/* turbopackIgnore: true */ png, overlay.png);
      const m = Math.max(0, Math.round(overlay.margin));
      // Even dimensions keep libx264 + yuv420p happy for odd-sized provider outputs.
      const filter = `[0:v:0][1:v]overlay=x=main_w-overlay_w-${m}:y=main_h-overlay_h-${m}:format=auto,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]`;
      const base = [...head, "-i", png, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?", ...x264];
      attempts = [
        { args: [...base, "-c:a", "copy", ...tail], timeoutMs: FFMPEG_ENCODE_TIMEOUT_MS },
        { args: [...base, ...aac, ...tail], timeoutMs: FFMPEG_ENCODE_TIMEOUT_MS },
      ];
    } else {
      const map = ["-map", "0:v:0", "-map", "0:a?"];
      attempts = [
        { args: [...head, ...map, "-c", "copy", ...tail], timeoutMs: FFMPEG_TIMEOUT_MS },
        { args: [...head, ...map, ...x264, ...aac, ...tail], timeoutMs: FFMPEG_ENCODE_TIMEOUT_MS },
      ];
    }

    let lastError = "";
    for (const attempt of attempts) {
      await fs.rm(/* turbopackIgnore: true */ output, { force: true });
      const { code, stderr } = await runFfmpeg(bin, attempt.args, attempt.timeoutMs);
      const bytes = code === 0 ? await fs.readFile(/* turbopackIgnore: true */ output).catch(() => null) : null;
      if (bytes && bytes.length > 0) return { bytes, mimeType: "video/mp4", overlaid: overlay !== null, probe };
      lastError = code === null ? "timed out" : stderr.trim().slice(-300) || `exit code ${code}`;
    }
    throw new Error(`ffmpeg could not finalize the video: ${lastError}`);
  });
}
