/** Unit tests for the active-liveness verifier (src/server/safety/liveness.ts). */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock);

import { createTestDb, createTestUser } from "../../helpers/db";
import { identityEmbedding, providers, useMockProviders } from "./fixtures";
import type { DetectedFace, FaceProvider } from "@/providers/types";
import { AppError } from "@/server/http";
import { LIVENESS_STEPS, pickLivenessChallenge, verifyLiveness, type LivenessStep } from "@/server/safety/liveness";

let userId: string;
beforeEach(async () => {
  await createTestDb();
  useMockProviders();
  userId = (await createTestUser()).id;
});

/** Distinct images (different gradients), so the near-duplicate check passes. */
async function frame(seed: number): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="${seed % 2}" y1="0" x2="${(seed + 1) % 2}" y2="1"><stop offset="0" stop-color="#${(seed * 2654435761 % 0xffffff).toString(16).padStart(6, "0")}"/><stop offset="1" stop-color="#0${seed}${seed}0f0"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="${20 + seed * 15}" cy="${30 + seed * 10}" r="20" fill="#fff"/></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

const keyOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Face provider that reports a pose per image (looked up by content). */
function poseProvider(name: string, poses: Map<string, Partial<DetectedFace>>): FaceProvider {
  return {
    name,
    matchThreshold: 0.6,
    analyze: async (bytes) => ({
      width: 128,
      height: 128,
      faces: [{ box: { x: 30, y: 30, width: 60, height: 60 }, confidence: 0.99, embedding: identityEmbedding("alice"), age: 30, ...poses.get(keyOf(bytes)) }],
    }),
  };
}

async function setup(name: string, steps: LivenessStep[], framePoses: Partial<DetectedFace>[], frontalPose: Partial<DetectedFace> = { yaw: 0, pitch: 0 }) {
  const frontal = await frame(0);
  const frames = await Promise.all(steps.map((_, i) => frame(i + 1)));
  const poses = new Map<string, Partial<DetectedFace>>(frames.map((f, i) => [keyOf(f), framePoses[i]!]));
  providers.face = poseProvider(name, poses);
  return () => verifyLiveness({ bytes: frontal, embedding: identityEmbedding("alice"), ...frontalPose }, frames, steps, { userId });
}

describe("pickLivenessChallenge", () => {
  it("returns distinct, known steps in random order", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const steps = pickLivenessChallenge();
      expect(new Set(steps).size).toBe(steps.length);
      for (const s of steps) expect(LIVENESS_STEPS).toContain(s);
      seen.add(steps.join(","));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe("verifyLiveness", () => {
  it("verifies direction for providers with a verified sign convention", async () => {
    const run = await setup("local", ["turn_left", "turn_right"], [{ yaw: -20, pitch: 0 }, { yaw: 20, pitch: 0 }]);
    const evidence = await run();
    expect(evidence).toMatchObject({ poseVerified: true, directionChecked: { yaw: true, pitch: false } });
    expect(evidence.frames.map((f) => f.yawDelta)).toEqual([-20, 20]);
  });

  it("checks magnitude only (plus opposite signs) for an unverified convention", async () => {
    // Rekognition: sign unverified, so "left" may come out positive...
    await expect((await setup("rekognition", ["turn_left", "look_up"], [{ yaw: 20, pitch: 0 }, { yaw: 0, pitch: -15 }]))()).resolves.toMatchObject({
      poseVerified: true,
    });
    // ...but opposite steps on one axis must move opposite ways.
    const same = await setup("rekognition", ["turn_left", "turn_right"], [{ yaw: 20, pitch: 0 }, { yaw: 25, pitch: 0 }]);
    await expect(same()).rejects.toBeInstanceOf(AppError);
  });

  it("fails closed when the provider measures pose for some frames only", async () => {
    const run = await setup("local", ["turn_left", "look_up"], [{ yaw: -20, pitch: 0 }, { yaw: undefined, pitch: undefined }]);
    await expect(run()).rejects.toMatchObject({ code: "consent_required" });
  });

  it("without any pose from the provider, still requires the same person in distinct frames", async () => {
    const run = await setup("nopose", ["turn_left", "look_up"], [{}, {}], {});
    await expect(run()).resolves.toMatchObject({ poseVerified: false });
  });

  it("refuses a frame showing a minor", async () => {
    const run = await setup("local", ["turn_left", "turn_right"], [{ yaw: -20, pitch: 0, age: 12 }, { yaw: 20, pitch: 0 }]);
    await expect(run()).rejects.toMatchObject({ code: "content_blocked" });
  });
});

describe("e2e fake-camera fixtures (tests/fixtures/liveness)", () => {
  it("satisfy every head-pose step with the mock face provider, after a camera-style JPEG re-encode", async () => {
    useMockProviders();
    const { readFixture } = await import("../../fixtures");
    const camera = async (name: string) =>
      new Uint8Array(await sharp(readFixture(`liveness/default-${name}.jpg`)).jpeg({ quality: 92 }).toBuffer());
    const frontal = await camera("frontal");
    const { faces } = await providers.face!.analyze(frontal);
    const main = faces[0]!;
    for (const steps of [["turn_left", "look_up"], ["turn_right", "look_down"], ["look_down", "turn_left"]] as LivenessStep[][]) {
      const frames = await Promise.all(steps.map(camera));
      const evidence = await verifyLiveness({ bytes: frontal, embedding: main.embedding, yaw: main.yaw, pitch: main.pitch }, frames, steps, { userId });
      expect(evidence.poseVerified).toBe(true);
    }
  });
});
