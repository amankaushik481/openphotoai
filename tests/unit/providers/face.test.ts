import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cosineSimilarity, createMockFaceProvider, mockFaceEmbedding } from "@/providers/mock/face";
import { MOCK_IDENTITIES } from "@/providers/mock/markers";
import { ALICE_SELFIES, readFixture, readSelfie } from "../../fixtures";

const face = createMockFaceProvider();

async function primary(bytes: Uint8Array) {
  const { faces } = await face.analyze(bytes);
  expect(faces.length).toBeGreaterThan(0);
  return faces[0];
}

describe("mock face provider", () => {
  it("matches the same identity across photos and rejects other identities", async () => {
    const a1 = await primary(readSelfie("alice-01"));
    const a2 = await primary(readSelfie("alice-07"));
    const teen = await primary(readSelfie("teen-01"));
    const bob = await primary(readSelfie("bob-01"));

    expect(face.matchThreshold).toBe(0.6);
    expect(a1.embedding).toHaveLength(128);
    expect(Math.hypot(...a1.embedding)).toBeCloseTo(1, 6);
    expect(cosineSimilarity(a1.embedding, a2.embedding)).toBeGreaterThan(0.95);
    expect(cosineSimilarity(a1.embedding, teen.embedding)).toBeGreaterThan(0.95);
    expect(cosineSimilarity(a1.embedding, bob.embedding)).toBeLessThan(0.3);
    // Two different images of the same identity are not bit-identical.
    expect(cosineSimilarity(a1.embedding, a2.embedding)).toBeLessThan(0.9999);
  });

  it("keeps known identity base vectors mutually orthogonal", () => {
    const labels = ["default", ...MOCK_IDENTITIES];
    for (const a of labels) {
      for (const b of labels) {
        if (a === b) continue;
        expect(Math.abs(cosineSimilarity(mockFaceEmbedding(a), mockFaceEmbedding(b)))).toBeLessThan(1e-9);
      }
    }
    expect(cosineSimilarity(mockFaceEmbedding("alice", "x"), mockFaceEmbedding("alice", "y"))).toBeGreaterThan(0.95);
  });

  it("reports age, face count and a centered 40% box from the marker", async () => {
    const alice = await face.analyze(readSelfie("alice-01"));
    expect(alice).toMatchObject({ width: 1024, height: 1280 });
    expect(alice.faces).toHaveLength(1);
    expect(alice.faces[0].age).toBe(29);
    expect(alice.faces[0].box).toEqual({ x: 307, y: 384, width: 410, height: 512 });

    expect((await primary(readSelfie("teen-01"))).age).toBe(15);
    const group = await face.analyze(readSelfie("group-01"));
    expect(group.faces).toHaveLength(2);
    expect(cosineSimilarity(group.faces[0].embedding, group.faces[1].embedding)).toBeLessThan(0.3);
  });

  it("treats unmarked images as one adult 'default' face", async () => {
    const plain = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#8a7" } }).jpeg().toBuffer();
    const { faces, width, height } = await face.analyze(new Uint8Array(plain));
    expect({ width, height }).toEqual({ width: 640, height: 800 });
    expect(faces).toHaveLength(1);
    expect(faces[0].age).toBe(30);
    expect(cosineSimilarity(faces[0].embedding, mockFaceEmbedding("default"))).toBeGreaterThan(0.95);
  });

  it("spreads head poses across the alice set, stable under re-encoding", async () => {
    const buckets = new Set<string>();
    for (const name of ALICE_SELFIES) {
      const bytes = readSelfie(name);
      const f = await primary(bytes);
      expect(Math.abs(f.yaw ?? 99)).toBeLessThanOrEqual(35);
      expect(Math.abs(f.pitch ?? 99)).toBeLessThanOrEqual(35);
      const yaw = f.yaw ?? 0;
      const pitch = f.pitch ?? 0;
      buckets.add(yaw < -15 ? "left" : yaw > 15 ? "right" : pitch > 12 ? "up" : pitch < -12 ? "down" : "frontal");

      const reencoded = await sharp(bytes).resize(800).jpeg({ quality: 85 }).toBuffer();
      const g = await primary(new Uint8Array(reencoded));
      expect(Math.abs((g.yaw ?? 0) - yaw)).toBeLessThan(4);
      expect(Math.abs((g.pitch ?? 0) - pitch)).toBeLessThan(4);
      expect(cosineSimilarity(f.embedding, g.embedding)).toBeGreaterThan(0.95);
    }
    expect([...buckets].sort()).toEqual(["down", "frontal", "left", "right", "up"]);
  });

  it("returns no faces for a zero-face marker and throws on non-images", async () => {
    expect((await face.analyze(readFixture("garment.jpg"))).faces).toHaveLength(0);
    await expect(face.analyze(new TextEncoder().encode("nope"))).rejects.toThrow(/unsupported image/);
  });
});
