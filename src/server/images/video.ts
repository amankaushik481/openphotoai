/**
 * Video probing + frame extraction with the ffmpeg-static binary (no system ffmpeg needed).
 */
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { AppError } from "@/server/http";

const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_STDERR = 64 * 1024;
const MAX_FRAMES = 30;

function resolveFfmpeg(): string {
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    throw new Error("ffmpeg binary not found: the ffmpeg-static package is missing or unsupported on this platform");
  }
  return ffmpegPath;
}

function runFfmpeg(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
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

/** Probe a video and extract `count` evenly spaced JPEG frames (the first one at t=0). */
export async function extractFrames(
  video: Uint8Array,
  count = 3,
): Promise<{ durationSec: number; width: number; height: number; frames: Uint8Array[] }> {
  const bin = resolveFfmpeg();
  const n = Math.min(Math.max(Math.floor(count), 1), MAX_FRAMES);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-video-"));
  try {
    const input = path.join(dir, "input");
    await fs.writeFile(input, video);

    // `ffmpeg -i` without an output exits non-zero but prints the stream info we need.
    const probe = parseFfmpegProbe((await runFfmpeg(bin, ["-hide_banner", "-nostdin", "-i", input])).stderr);
    if (!probe) throw new AppError("validation_error", "We couldn't read this video.");

    const frames: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      const at = (probe.durationSec * i) / n;
      const out = path.join(dir, `frame-${i}.jpg`);
      const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-ss", at.toFixed(3), "-i", input];
      await runFfmpeg(bin, [...args, "-frames:v", "1", "-q:v", "3", "-f", "image2", out]);
      // A seek past the last decodable frame yields no output; skip it rather than fail.
      const bytes = await fs.readFile(out).catch(() => null);
      if (bytes && bytes.length > 0) frames.push(bytes);
    }
    if (frames.length === 0) throw new AppError("validation_error", "We couldn't read this video.");
    return { ...probe, frames };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
