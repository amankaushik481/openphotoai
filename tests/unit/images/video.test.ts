import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractVideoFrames } from "@/server/images/process";
import { parseFfmpegProbe } from "@/server/images/video";
import { AppError } from "@/server/http";

const run = promisify(execFile);
let dir: string;
let mp4: Buffer;

const leftoverTempDirs = async () => (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith("openshoot-video-"));

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-fixture-video-"));
  const out = path.join(dir, "clip.mp4");
  // 2s, 160x120, 10fps test pattern.
  await run(ffmpegPath!, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=10",
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "+faststart", out,
  ]);
  mp4 = await fs.readFile(out);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("extractVideoFrames", () => {
  it("probes duration + size and extracts evenly spaced JPEG frames, cleaning up temp files", async () => {
    const before = await leftoverTempDirs();
    const result = await extractVideoFrames(mp4, 3);
    expect(result.durationSec).toBeCloseTo(2, 1);
    expect([result.width, result.height]).toEqual([160, 120]);
    expect(result.frames).toHaveLength(3);
    for (const frame of result.frames) {
      const meta = await sharp(frame).metadata();
      expect(meta.format).toBe("jpeg");
      expect([meta.width, meta.height]).toEqual([160, 120]);
    }
    // testsrc changes over time, so the sampled frames differ.
    expect(Buffer.compare(Buffer.from(result.frames[0]!), Buffer.from(result.frames[2]!))).not.toBe(0);
    expect(await leftoverTempDirs()).toEqual(before);
  });

  it("defaults to 3 frames and clamps the count", async () => {
    expect((await extractVideoFrames(mp4)).frames).toHaveLength(3);
    expect((await extractVideoFrames(mp4, 0)).frames).toHaveLength(1);
  });

  it("rejects non-video input with a validation error", async () => {
    const err = await extractVideoFrames(new TextEncoder().encode("not a video at all")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("validation_error");
  });
});

describe("parseFfmpegProbe", () => {
  it("parses duration and size, swapping for rotated streams", () => {
    const stderr = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 25 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 21 kb/s, 30 fps
      Side data:
        displaymatrix: rotation of -90.00 degrees`;
    expect(parseFfmpegProbe(stderr)).toEqual({ durationSec: 62.5, width: 1080, height: 1920 });
    expect(parseFfmpegProbe(stderr.replace(/\n\s+Side data:[\s\S]*$/, ""))).toEqual({ durationSec: 62.5, width: 1920, height: 1080 });
  });

  it("returns null without a video stream", () => {
    expect(parseFfmpegProbe("input: Invalid data found when processing input")).toBeNull();
    expect(parseFfmpegProbe("Stream #0:0: Audio: aac (LC), 44100 Hz, stereo")).toBeNull();
  });
});
