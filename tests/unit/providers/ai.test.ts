import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { zipSync } from "fflate";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { createMockAIProvider, MOCK_WEBHOOK_HEADER, signMockWebhook } from "@/providers/mock/ai";
import { cosineSimilarity, createMockFaceProvider } from "@/providers/mock/face";
import { decodeMarker } from "@/providers/mock/markers";
import { createMockModerationProvider } from "@/providers/mock/moderation";
import { MAX_PAYLOAD_JSON } from "@/providers/mock/payload";
import type { GenerateInput, ProviderJobStatus, ProviderOutput } from "@/providers/types";
import { readSelfie } from "../../fixtures";

const identity = { modelRef: "mock-lora://ohwxtest", triggerWord: "ohwxtest", subject: "woman" as const };
const genInput = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  prompt: "ohwxtest woman on a yacht at sunset",
  identity,
  aspectRatio: "4:5",
  numImages: 2,
  quality: "standard",
  ...over,
});

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function succeeded(status: ProviderJobStatus): ProviderOutput {
  if (status.state !== "succeeded") throw new Error(`expected succeeded, got ${JSON.stringify(status)}`);
  return status.output;
}

const originalDelay = process.env.MOCK_JOB_DELAY_MS;
afterEach(() => {
  if (originalDelay === undefined) delete process.env.MOCK_JOB_DELAY_MS;
  else process.env.MOCK_JOB_DELAY_MS = originalDelay;
  resetEnvCache();
});

describe("mock AI provider lifecycle", () => {
  it("runs until the delay elapses, then succeeds with sized outputs", async () => {
    const c = clock();
    const ai = createMockAIProvider({ now: c.now, delayMs: 1000 });
    const ref = await ai.submitGenerate(genInput());
    expect(ref.provider).toBe("mock");
    expect(ref.requestId).toMatch(/^mock_1700000000000_gen_[A-Za-z0-9_-]+$/);

    const running = await ai.getStatus(ref);
    expect(running).toMatchObject({ state: "running", progress: 0 });
    c.advance(500);
    expect(await ai.getStatus(ref)).toMatchObject({ state: "running", progress: 0.5 });
    c.advance(500);
    const output = succeeded(await ai.getStatus(ref));
    expect(output.images).toHaveLength(2);
    expect(output.images?.[0]).toMatchObject({ width: 816, height: 1024, contentType: "image/png" });
    expect(output.images?.[0].url).toMatch(/^mock:\/\/image\/.+\/0$/);

    const { bytes, contentType } = await ai.fetchOutput(output.images![1].url);
    expect(contentType).toBe("image/png");
    const meta = await sharp(bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 816, 1024]);
    // Plain outputs carry no marker; the same URL renders the same bytes.
    expect(await decodeMarker(bytes)).toBeNull();
    expect(Buffer.from((await ai.fetchOutput(output.images![1].url)).bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("reads MOCK_JOB_DELAY_MS from env (training waits 4x) and is done immediately at 0", async () => {
    const c = clock();
    const ai = createMockAIProvider({ now: c.now });
    process.env.MOCK_JOB_DELAY_MS = "1000";
    resetEnvCache();
    const gen = await ai.submitGenerate(genInput());
    const train = await ai.submitTraining({ imagesZipUrl: "https://example.com/x.zip", imageCount: 12, triggerWord: "ohwxabc", subject: "man" });
    c.advance(1500);
    expect((await ai.getStatus(gen)).state).toBe("succeeded");
    expect((await ai.getStatus(train)).state).toBe("running");
    c.advance(2500);
    expect(succeeded(await ai.getStatus(train)).modelRef).toBe("mock-lora://ohwxabc");

    process.env.MOCK_JOB_DELAY_MS = "0";
    resetEnvCache();
    expect((await ai.getStatus(await ai.submitGenerate(genInput()))).state).toBe("succeeded");
  });

  it("honours [mock:fail], [mock:stuck] and [mock:nsfw-output]", async () => {
    const c = clock();
    const ai = createMockAIProvider({ now: c.now, delayMs: 0 });
    const failed = await ai.getStatus(await ai.submitGenerate(genInput({ prompt: "portrait [mock:fail]" })));
    expect(failed).toEqual({ state: "failed", error: "Mock provider failure", retryable: false });

    const stuck = await ai.submitGenerate(genInput({ prompt: "portrait [mock:stuck]" }));
    c.advance(10 * 60 * 1000);
    expect((await ai.getStatus(stuck)).state).toBe("running");

    const nsfw = succeeded(await ai.getStatus(await ai.submitGenerate(genInput({ prompt: "x [mock:nsfw-output]", numImages: 1 }))));
    const { bytes } = await ai.fetchOutput(nsfw.images![0].url);
    expect((await decodeMarker(bytes))?.nsfw).toBe(true);
    expect((await createMockModerationProvider().checkImage(bytes)).allowed).toBe(false);
  });

  it("issues unique, compact request ids", async () => {
    const ai = createMockAIProvider({ now: () => 1 });
    const prompt = `ohwxtest ${'"quoted" '.repeat(80)}`;
    const a = await ai.submitGenerate(genInput({ prompt }));
    const b = await ai.submitGenerate(genInput({ prompt }));
    expect(a.requestId).not.toBe(b.requestId);
    const json = Buffer.from(a.requestId.split("_gen_")[1], "base64url").toString("utf8");
    expect(json.length).toBeLessThanOrEqual(MAX_PAYLOAD_JSON);
    expect(JSON.parse(json).p.length).toBeLessThanOrEqual(80);
    expect((await ai.getStatus({ ...a, requestId: "mock_1_gen_garbage" })).state).toBe("failed");
  });

  it("sizes outputs by aspect ratio and quality", async () => {
    const ai = createMockAIProvider({ delayMs: 0 });
    const cases = [
      { aspectRatio: "16:9", quality: "draft", size: [512, 288] },
      { aspectRatio: "1:1", quality: "high", size: [1536, 1536] },
      { aspectRatio: "9:16", quality: "standard", size: [576, 1024] },
    ] as const;
    for (const { aspectRatio, quality, size } of cases) {
      const out = succeeded(await ai.getStatus(await ai.submitGenerate(genInput({ aspectRatio, quality, numImages: 1 }))));
      expect([out.images?.[0].width, out.images?.[0].height]).toEqual(size);
    }
  });
});

describe("mock AI provider identity + inputs", () => {
  const face = createMockFaceProvider();

  it("keeps the identity of reference photos and trained models", async () => {
    const ai = createMockAIProvider({ delayMs: 0 });
    const alice = readSelfie("alice-01");
    const aliceFace = (await face.analyze(alice)).faces[0];

    const refUrl = await ai.uploadInput(alice, "image/jpeg");
    expect(refUrl).toMatch(/^mock:\/\/input\/[a-f0-9]{64}$/);
    expect(Buffer.from((await ai.fetchOutput(refUrl)).bytes).equals(Buffer.from(alice))).toBe(true);

    const instant = await ai.submitGenerate(genInput({ numImages: 1, identity: { ...identity, referenceImageUrls: [refUrl] } }));
    const instantImg = (await ai.fetchOutput(succeeded(await ai.getStatus(instant)).images![0].url)).bytes;
    expect(cosineSimilarity((await face.analyze(instantImg)).faces[0].embedding, aliceFace.embedding)).toBeGreaterThan(0.9);

    const zipUrl = await ai.uploadInput(zipSync({ "1.jpg": alice, "2.jpg": readSelfie("alice-02") }), "application/zip");
    const train = await ai.submitTraining({ imagesZipUrl: zipUrl, imageCount: 2, triggerWord: "ohwxalice", subject: "woman" });
    const modelRef = succeeded(await ai.getStatus(train)).modelRef!;
    expect(modelRef).toBe("mock-lora://ohwxalice#alice");

    const gen = await ai.submitGenerate(genInput({ numImages: 1, identity: { ...identity, modelRef } }));
    const genImg = (await ai.fetchOutput(succeeded(await ai.getStatus(gen)).images![0].url)).bytes;
    expect(cosineSimilarity((await face.analyze(genImg)).faces[0].embedding, aliceFace.embedding)).toBeGreaterThan(0.9);

    // Edits of a mock output keep its identity; upscaling scales the size.
    const genUrl = succeeded(await ai.getStatus(gen)).images![0].url;
    const up = succeeded(await ai.getStatus(await ai.submitUpscale({ imageUrl: genUrl, scale: 2, faceRestore: false })));
    expect([up.images?.[0].width, up.images?.[0].height]).toEqual([1640, 2048]);
    const multi = succeeded(
      await ai.getStatus(
        await ai.submitEdit({ mode: "multi_person", prompt: "two friends", imageUrls: [], identities: [{ ...identity, modelRef }, identity], numImages: 1 }),
      ),
    );
    expect((await face.analyze((await ai.fetchOutput(multi.images![0].url)).bytes)).faces).toHaveLength(2);
  });

  it("removes backgrounds with transparency", async () => {
    const ai = createMockAIProvider({ delayMs: 0 });
    const src = succeeded(await ai.getStatus(await ai.submitGenerate(genInput({ numImages: 1, aspectRatio: "1:1", quality: "draft" }))));
    const out = succeeded(await ai.getStatus(await ai.submitRemoveBackground({ imageUrl: src.images![0].url })));
    const { bytes } = await ai.fetchOutput(out.images![0].url);
    const stats = await sharp(bytes).stats();
    expect((await sharp(bytes).metadata()).hasAlpha).toBe(true);
    expect(stats.isOpaque).toBe(false);
  });
});

describe("mock AI provider video", () => {
  function probe(bytes: Uint8Array): { info: string; frame: Uint8Array } {
    const dir = mkdtempSync(path.join(tmpdir(), "mock-video-test-"));
    try {
      writeFileSync(path.join(dir, "v.mp4"), bytes);
      const res = spawnSync(ffmpegPath ?? "ffmpeg", ["-hide_banner", "-i", path.join(dir, "v.mp4"), "-frames:v", "1", path.join(dir, "f.png")]);
      return { info: res.stderr.toString(), frame: new Uint8Array(readFileSync(path.join(dir, "f.png"))) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("renders a small H.264 MP4 that carries output markers", async () => {
    const ai = createMockAIProvider({ delayMs: 0 });
    const ref = await ai.submitImageToVideo({ imageUrl: "mock://nope", prompt: "slow push-in [mock:nsfw-output]", durationSec: 5, aspectRatio: "4:5" });
    const out = succeeded(await ai.getStatus(ref));
    expect(out.videos?.[0]).toMatchObject({ contentType: "video/mp4", durationSec: 3 });

    const { bytes, contentType } = await ai.fetchOutput(out.videos![0].url);
    expect(contentType).toBe("video/mp4");
    expect(Buffer.from(bytes.subarray(4, 8)).toString("latin1")).toBe("ftyp");
    expect(bytes.byteLength).toBeLessThan(1_000_000);

    const { info, frame } = probe(bytes);
    expect(info).toMatch(/Video: h264/);
    expect(info).toMatch(/yuv420p/);
    expect(info).toMatch(/408x512/);
    expect(info).toMatch(/Duration: 00:00:0[23]/);
    expect((await decodeMarker(frame))?.nsfw).toBe(true);

    // Cached per payload: the second fetch returns identical bytes.
    expect(Buffer.from((await ai.fetchOutput(out.videos![0].url)).bytes).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe("mock AI provider misc", () => {
  it("rewrites prompts deterministically with photography details", async () => {
    const ai = createMockAIProvider();
    const a = await ai.promptHelper({ request: "me on a yacht at sunset looking rich", subject: "man" });
    const b = await ai.promptHelper({ request: "me on a yacht at sunset looking rich", subject: "man" });
    expect(a).toEqual(b);
    expect(a.prompt).toMatch(/^professional photo of a man on a yacht at sunset looking rich, /);
    expect(a.prompt).toMatch(/lens/);
    expect(a.prompt).toMatch(/light/);
    expect(a.suggestions).toHaveLength(3);
    expect(new Set([a.prompt, ...(a.suggestions ?? [])]).size).toBe(4);
  });

  it("verifies webhook signatures", async () => {
    const ai = createMockAIProvider();
    const rawBody = JSON.stringify({ requestId: "mock_1_gen_abc", status: "succeeded" });
    const ok = await ai.parseWebhook({ headers: new Headers({ [MOCK_WEBHOOK_HEADER]: signMockWebhook(rawBody) }), rawBody, url: "http://x" });
    expect(ok).toEqual({ eventId: "mock_1_gen_abc:succeeded", requestId: "mock_1_gen_abc" });
    await expect(
      ai.parseWebhook({ headers: new Headers({ [MOCK_WEBHOOK_HEADER]: "deadbeef" }), rawBody, url: "http://x" }),
    ).rejects.toThrow(/signature/);
    await expect(ai.parseWebhook({ headers: new Headers(), rawBody, url: "http://x" })).rejects.toThrow(/signature/);
  });

  it("rejects URLs it did not produce", async () => {
    const ai = createMockAIProvider();
    await expect(ai.fetchOutput("https://example.com/a.png")).rejects.toThrow(/Not a mock provider URL/);
    await expect(ai.fetchOutput(`mock://input/${"0".repeat(64)}`)).rejects.toThrow(/no longer cached/);
  });
});
