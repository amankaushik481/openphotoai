import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { cosineSimilarity } from "@/providers/safety/face-math";
import { createLocalFaceProvider, LOCAL_FACE_MATCH_THRESHOLD } from "@/providers/safety/local-face";
import { getTfRuntime } from "@/providers/safety/tf-runtime";
import { blankImage, hasHumanSamples, manPortrait, otherWomanPortrait, skipReason, womanPortrait } from "./samples";

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("createLocalFaceProvider (factory)", () => {
  it("is cheap and exposes a sane threshold without loading models", () => {
    const p = createLocalFaceProvider();
    expect(p.name).toBe("local");
    expect(p.matchThreshold).toBe(LOCAL_FACE_MATCH_THRESHOLD);
    expect(p.matchThreshold).toBeGreaterThan(0.5);
    expect(p.matchThreshold).toBeLessThan(0.9);
  });
});

describe("local face provider on a synthetic image", () => {
  it("finds no face in a blank image and reports its size", async () => {
    const res = await createLocalFaceProvider().analyze(await blankImage(640, 480));
    expect(res).toEqual({ faces: [], width: 640, height: 480 });
  }, 60_000);

  it("rejects bytes that are not an image", async () => {
    await expect(createLocalFaceProvider().analyze(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

describe.skipIf(!hasHumanSamples)(`local face provider on real faces${hasHumanSamples ? "" : ` (skipped: ${skipReason})`}`, () => {
  const provider = createLocalFaceProvider();
  let man: Uint8Array;

  beforeAll(async () => {
    man = await manPortrait();
  });

  it("detects one face with box, confidence, age, pose and a normalized 1024-d embedding", async () => {
    const res = await provider.analyze(man);
    expect(res.width).toBe(180);
    expect(res.height).toBe(180);
    expect(res.faces).toHaveLength(1);
    const [f] = res.faces;
    expect(f.confidence).toBeGreaterThan(0.8);
    expect(f.box.width).toBeGreaterThan(60);
    expect(f.box.x + f.box.width).toBeLessThanOrEqual(res.width + 2);
    expect(f.box.y + f.box.height).toBeLessThanOrEqual(res.height + 2);
    expect(f.embedding).toHaveLength(1024);
    expect(norm(f.embedding)).toBeCloseTo(1, 5);
    expect(f.age).toBeGreaterThan(25);
    expect(f.age).toBeLessThan(65);
    for (const angle of [f.yaw, f.pitch, f.roll]) {
      expect(typeof angle).toBe("number");
      expect(Math.abs(angle!)).toBeLessThan(45);
    }
  }, 60_000);

  it("is deterministic: the same image twice has similarity ≈ 1", async () => {
    const a = await provider.analyze(man);
    const b = await provider.analyze(man);
    expect(cosineSimilarity(a.faces[0].embedding, b.faces[0].embedding)).toBeGreaterThan(0.9999);
  }, 60_000);

  it("matches the same photo after resize + recompression and applies EXIF orientation", async () => {
    const ref = (await provider.analyze(man)).faces[0];
    const upscaled = new Uint8Array(await sharp(man).resize(400).jpeg({ quality: 70 }).toBuffer());
    // Pixels stored rotated, EXIF orientation 8 says "rotate back to display".
    const exifRotated = new Uint8Array(await sharp(man).rotate(90).withMetadata({ orientation: 8 }).jpeg().toBuffer());
    const up = await provider.analyze(upscaled);
    const rot = await provider.analyze(exifRotated);
    expect(up.width).toBe(400);
    expect(rot.width).toBe(180);
    expect(rot.height).toBe(180);
    expect(rot.faces).toHaveLength(1);
    expect(cosineSimilarity(ref.embedding, up.faces[0].embedding)).toBeGreaterThan(0.95);
    expect(cosineSimilarity(ref.embedding, rot.faces[0].embedding)).toBeGreaterThan(0.95);
  }, 60_000);

  it("mirrors yaw and roll when the image is flipped horizontally", async () => {
    const ref = (await provider.analyze(man)).faces[0];
    const flipped = (await provider.analyze(new Uint8Array(await sharp(man).flop().jpeg().toBuffer()))).faces[0];
    expect(flipped.yaw!).toBeCloseTo(-ref.yaw!, -0.7); // within ~2.5°
    expect(flipped.roll!).toBeCloseTo(-ref.roll!, -0.7);
  }, 60_000);

  it("scores different people below the match threshold", async () => {
    const m = (await provider.analyze(man)).faces[0];
    const w1 = (await provider.analyze(await womanPortrait())).faces[0];
    const w2 = (await provider.analyze(await otherWomanPortrait())).faces[0];
    expect(cosineSimilarity(m.embedding, w1.embedding)).toBeLessThan(provider.matchThreshold);
    expect(cosineSimilarity(m.embedding, w2.embedding)).toBeLessThan(provider.matchThreshold);
  }, 60_000);

  it("only routes file:// model loads inside the registered model directory", async () => {
    await provider.analyze(man);
    const { tf } = await getTfRuntime();
    expect(tf.getBackend()).toBe("wasm");
    expect(tf.io.getLoadHandlers("file:///etc/passwd")).toHaveLength(0);
    expect(tf.io.getLoadHandlers("file:///tmp/evil/model.json")).toHaveLength(0);
  }, 60_000);
});
