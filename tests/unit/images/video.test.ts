import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyVideoAiLabel, extractVideoFrames, readVideoAiLabel, watermarkPng } from "@/server/images/process";
import { finalizeVideo, parseFfmpegMetadata, parseFfmpegProbe, readVideoMetadata } from "@/server/images/video";
import { AppError } from "@/server/http";

const run = promisify(execFile);
let dir: string;
let mp4: Buffer;
let withAudio: Buffer;

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
  // 1s 320x240 clip with an AAC track (talking videos carry audio).
  const out2 = path.join(dir, "talk.mp4");
  await run(ffmpegPath!, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10",
    "-f", "lavfi", "-i", "sine=duration=1",
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-shortest", out2,
  ]);
  withAudio = await fs.readFile(out2);
});

/** `ffmpeg -i` stream listing of a clip. */
async function streamInfo(bytes: Uint8Array): Promise<string> {
  const file = path.join(dir, `probe-${Math.random().toString(36).slice(2)}.mp4`);
  await fs.writeFile(file, bytes);
  // Without an output file ffmpeg exits 1 after printing the stream info.
  const err = (await run(ffmpegPath!, ["-hide_banner", "-i", file]).catch((e: unknown) => e)) as { stderr?: string };
  return String(err.stderr ?? "");
}

/** Mean absolute RGB difference of a region between two JPEG frames. */
async function regionDiff(a: Uint8Array, b: Uint8Array, region: { left: number; top: number; width: number; height: number }) {
  const raw = (img: Uint8Array) => sharp(img).extract(region).removeAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  let sum = 0;
  for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i]! - rb[i]!);
  return sum / ra.length;
}

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

describe("parseFfmpegMetadata", () => {
  it("reads the container tags (not stream tags) and joins continuation lines", () => {
    const stderr = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'out.mp4':
  Metadata:
    major_brand     : isom
    comment         : AI-generated with X (IPTC trainedAlgorithmicMedia) job:job_1
    description     : line one
                    : line two
  Duration: 00:00:01.00, start: 0.000000, bitrate: 123 kb/s
  Stream #0:0[0x1](und): Video: h264 (High), yuv420p(progressive), 160x120, 10 fps
      Metadata:
        handler_name    : VideoHandler`;
    expect(parseFfmpegMetadata(stderr)).toEqual({
      major_brand: "isom",
      comment: "AI-generated with X (IPTC trainedAlgorithmicMedia) job:job_1",
      description: "line one\nline two",
    });
    expect(parseFfmpegMetadata("no metadata here")).toEqual({});
  });
});

describe("finalizeVideo / applyVideoAiLabel", () => {
  it("embeds the AI label with a stream copy (no re-encode) and keeps audio", async () => {
    const labeled = await applyVideoAiLabel(withAudio, { generator: "test", jobId: "job_abc", createdAt: new Date("2026-01-02T03:04:05Z") });
    expect(labeled).toMatchObject({ mimeType: "video/mp4", watermarked: false, probe: { width: 320, height: 240 } });
    const label = await readVideoAiLabel(labeled.bytes);
    expect(label?.jobId).toBe("job_abc");
    expect(label?.comment).toContain("trainedAlgorithmicMedia");
    expect(label?.description).toContain("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia");
    const tags = await readVideoMetadata(labeled.bytes);
    expect(tags.creation_time).toMatch(/^2026-01-02T03:04:05/);
    // Stream copy: decoded frames are identical to the source.
    const [before, after] = await Promise.all([extractVideoFrames(withAudio, 1), extractVideoFrames(labeled.bytes, 1)]);
    expect(Buffer.compare(Buffer.from(before.frames[0]!), Buffer.from(after.frames[0]!))).toBe(0);
    // Audio survives the rewrite.
    expect(await streamInfo(labeled.bytes)).toMatch(/Audio: aac/);
    expect(await readVideoAiLabel(mp4)).toBeNull();
  });

  it("burns the watermark into the bottom-right corner only", async () => {
    const labeled = await applyVideoAiLabel(withAudio, { generator: "test", jobId: "job_wm", createdAt: new Date() }, { watermark: true });
    expect(labeled.watermarked).toBe(true);
    expect((await readVideoAiLabel(labeled.bytes))?.jobId).toBe("job_wm");
    const [before, after] = await Promise.all([extractVideoFrames(withAudio, 1), extractVideoFrames(labeled.bytes, 1)]);
    expect([after.width, after.height]).toEqual([320, 240]);
    const corner = { left: 200, top: 200, width: 110, height: 30 };
    const topLeft = { left: 0, top: 0, width: 100, height: 60 };
    expect(await regionDiff(before.frames[0]!, after.frames[0]!, corner)).toBeGreaterThan(10);
    expect(await regionDiff(before.frames[0]!, after.frames[0]!, topLeft)).toBeLessThan(5);
  });

  it("skips the overlay when the overlay builder declines and cleans up temp files", async () => {
    const before = await leftoverTempDirs();
    const result = await finalizeVideo(mp4, { metadata: { comment: "x" }, overlay: async () => null });
    expect(result.overlaid).toBe(false);
    expect((await readVideoMetadata(result.bytes)).comment).toBe("x");
    expect(await leftoverTempDirs()).toEqual(before);
    await expect(finalizeVideo(mp4, { metadata: { "bad key": "x" } })).rejects.toThrow(/invalid video metadata key/);
    await expect(finalizeVideo(new TextEncoder().encode("nope"), { metadata: {} })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("watermarkPng sizes the pill for the frame and refuses tiny frames", async () => {
    const wm = await watermarkPng(320, 240);
    expect(wm).not.toBeNull();
    const meta = await sharp(wm!.png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width!).toBeLessThan(320);
    expect(wm!.margin).toBeGreaterThan(0);
    expect(await watermarkPng(8, 8)).toBeNull();
  });
});
