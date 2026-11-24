import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, createTestUser } from "../../helpers/db";
import type { UserRow } from "@/db/types";
import type { DetectedFace } from "@/providers/types";
import { AppError } from "@/server/http";
import { extractVideoFrames } from "@/server/images/process";
import {
  analyzeTrainingPhotoSafety,
  assertReferenceImageAllowed,
  checkOutputImage,
  checkOutputVideo,
  likenessScore,
  verifyConsentSelfie,
} from "@/server/safety";
import { brokenFace, brokenModeration, eventsOf, identityEmbedding, markedImage, providers, useMockProviders } from "./fixtures";

vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock);
vi.mock("@/server/images/process", () => ({ extractVideoFrames: vi.fn() }));

let user: UserRow;
const ctx = () => ({ userId: user.id, jobId: "job_x", modelId: "mdl_x" });

// One database per file; every test gets a fresh user so event assertions stay isolated.
beforeAll(async () => {
  await createTestDb();
});

beforeEach(async () => {
  user = await createTestUser();
  useMockProviders();
  vi.mocked(extractVideoFrames).mockReset();
});

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

/** Face provider returning fixed faces (for shapes the mock marker can't express). */
function fixedFaces(faces: Partial<DetectedFace>[]) {
  providers.face = {
    name: "fixed",
    matchThreshold: 0.6,
    analyze: async () => ({
      width: 100,
      height: 100,
      faces: faces.map((f) => ({
        box: { x: 0, y: 0, width: 10, height: 10 },
        confidence: 0.9,
        embedding: identityEmbedding("alice"),
        ...f,
      })),
    }),
  };
}

describe("checkOutputImage", () => {
  it("allows a clean image without recording anything", async () => {
    const snap = await checkOutputImage(await markedImage(), ctx());
    expect(snap).toMatchObject({ allowed: true, provider: "mock", categories: [] });
    expect(Date.parse(snap.checkedAt)).not.toBeNaN();
    expect(await eventsOf(user.id)).toHaveLength(0);
  });

  it("blocks sexual outputs and records output_blocked", async () => {
    const snap = await checkOutputImage(await markedImage({ nsfw: true }), ctx());
    expect(snap).toMatchObject({ allowed: false, categories: ["sexual"] });
    const [event] = await eventsOf(user.id, "output_blocked");
    expect(event).toMatchObject({ jobId: "job_x", modelId: "mdl_x" });
    expect(event!.details).toMatchObject({ media: "image", categories: ["sexual"] });
  });

  it("fails closed when the classifier throws", async () => {
    providers.moderation = brokenModeration();
    const snap = await checkOutputImage(await markedImage(), ctx());
    expect(snap).toMatchObject({ allowed: false, categories: ["moderation_error"], provider: "broken" });
    expect(await eventsOf(user.id, "output_blocked")).toHaveLength(1);
  });
});

describe("checkOutputVideo", () => {
  it("samples 4 frames and allows a clean video", async () => {
    const frame = await markedImage();
    vi.mocked(extractVideoFrames).mockResolvedValue({ durationSec: 3, width: 256, height: 256, frames: [frame, frame, frame, frame] });
    const snap = await checkOutputVideo(new Uint8Array([1, 2, 3]), ctx());
    expect(extractVideoFrames).toHaveBeenCalledWith(expect.any(Uint8Array), 4);
    expect(snap.allowed).toBe(true);
    expect(await eventsOf(user.id)).toHaveLength(0);
  });

  it("blocks the video when any sampled frame is blocked", async () => {
    const clean = await markedImage();
    const nsfw = await markedImage({ nsfw: true });
    vi.mocked(extractVideoFrames).mockResolvedValue({ durationSec: 3, width: 256, height: 256, frames: [clean, clean, nsfw, clean] });
    const snap = await checkOutputVideo(new Uint8Array([1]), ctx());
    expect(snap).toMatchObject({ allowed: false, categories: ["sexual"] });
    const [event] = await eventsOf(user.id, "output_blocked");
    expect(event!.details).toMatchObject({ media: "video", blockedFrames: [2], framesChecked: 4 });
  });

  it("fails closed when frames can't be extracted", async () => {
    vi.mocked(extractVideoFrames).mockRejectedValue(new Error("ffmpeg missing"));
    expect(await checkOutputVideo(new Uint8Array([1]), ctx())).toMatchObject({ allowed: false, categories: ["moderation_error"] });
    vi.mocked(extractVideoFrames).mockResolvedValue({ durationSec: 0, width: 0, height: 0, frames: [] });
    expect((await checkOutputVideo(new Uint8Array([1]), ctx())).allowed).toBe(false);
    expect(await eventsOf(user.id, "output_blocked")).toHaveLength(2);
  });

  it("fails closed when the classifier throws on a frame", async () => {
    const frame = await markedImage();
    vi.mocked(extractVideoFrames).mockResolvedValue({ durationSec: 3, width: 256, height: 256, frames: [frame] });
    providers.moderation = brokenModeration();
    expect((await checkOutputVideo(new Uint8Array([1]), ctx())).allowed).toBe(false);
  });
});

describe("assertReferenceImageAllowed", () => {
  it("allows a clean adult reference and returns the face summary", async () => {
    const result = await assertReferenceImageAllowed(await markedImage({ age: 18 }), { ...ctx(), purpose: "reference" });
    expect(result.moderation.allowed).toBe(true);
    expect(result.face.count).toBe(1);
    expect(result.face.primary?.age).toBe(18);
    expect(result.face.primary).not.toHaveProperty("embedding");
  });

  it("blocks sexual images", async () => {
    const err = await rejection(assertReferenceImageAllowed(await markedImage({ nsfw: true }), { ...ctx(), purpose: "garment" }));
    expect(err.code).toBe("content_blocked");
    expect(err.message).toMatch(/sexual/);
    expect(await eventsOf(user.id, "reference_blocked")).toHaveLength(1);
  });

  it("blocks images with anyone under 18", async () => {
    const err = await rejection(assertReferenceImageAllowed(await markedImage({ age: 12, faces: 2 }), { ...ctx(), purpose: "reference" }));
    expect(err.message).toMatch(/under 18/);
    const [event] = await eventsOf(user.id, "underage");
    expect(event!.details).toMatchObject({ purpose: "reference", ages: [12, 12] });
  });

  it("blocks public figures when the provider can detect them", async () => {
    const err = await rejection(assertReferenceImageAllowed(await markedImage({ publicFigure: true }), { ...ctx(), purpose: "reference" }));
    expect(err.message).toMatch(/public figure/);
    expect(await eventsOf(user.id, "public_figure")).toHaveLength(1);
  });

  it("only classifies masks (no face checks)", async () => {
    const result = await assertReferenceImageAllowed(await markedImage({ age: 10 }), { ...ctx(), purpose: "mask" });
    expect(result).toMatchObject({ face: { count: 0 }, moderation: { allowed: true } });
    await rejection(assertReferenceImageAllowed(await markedImage({ nsfw: true }), { ...ctx(), purpose: "mask" }));
  });

  it("fails closed on classifier, face and celebrity-detector errors", async () => {
    const image = await markedImage();
    providers.moderation = brokenModeration();
    expect((await rejection(assertReferenceImageAllowed(image, { ...ctx(), purpose: "reference" }))).details).toEqual({
      categories: ["moderation_error"],
    });
    useMockProviders();
    providers.face = brokenFace();
    await rejection(assertReferenceImageAllowed(image, { ...ctx(), purpose: "reference" }));
    useMockProviders();
    providers.moderation!.detectPublicFigure = async () => {
      throw new Error("celebrity api down");
    };
    await rejection(assertReferenceImageAllowed(image, { ...ctx(), purpose: "reference" }));
    expect(await eventsOf(user.id, "reference_blocked")).toHaveLength(3);
  });
});

describe("verifyConsentSelfie", () => {
  it("returns a normalized embedding, face summary and age for one adult face", async () => {
    const result = await verifyConsentSelfie(await markedImage({ identity: "alice", age: 34 }), ctx());
    expect(result.age).toBe(34);
    expect(result.face.count).toBe(1);
    const norm = Math.hypot(...result.embedding);
    expect(norm).toBeCloseTo(1, 6);
    expect(await eventsOf(user.id)).toHaveLength(0);
  });

  it("requires a visible face", async () => {
    const err = await rejection(verifyConsentSelfie(await markedImage({ faces: 0 }), ctx()));
    expect(err.code).toBe("consent_required");
    expect(err.message).toMatch(/couldn't see your face/);
    const [event] = await eventsOf(user.id, "consent_failed");
    expect(event!.details).toMatchObject({ reason: "no_face" });
  });

  it("requires exactly one person", async () => {
    const err = await rejection(verifyConsentSelfie(await markedImage({ faces: 2 }), ctx()));
    expect(err.code).toBe("consent_required");
    expect(err.message).toMatch(/Only you should be in the selfie/);
  });

  it.each([12, 17, 19])("refuses an estimated age of %i (adults only, with margin)", async (age) => {
    const err = await rejection(verifyConsentSelfie(await markedImage({ age }), ctx()));
    expect(err.code).toBe("content_blocked");
    expect(err.message).toMatch(/is for adults only/);
    expect(await eventsOf(user.id, "underage")).toHaveLength(1);
  });

  it("accepts an estimated age at the margin (20)", async () => {
    await expect(verifyConsentSelfie(await markedImage({ age: 20 }), ctx())).resolves.toMatchObject({ age: 20 });
  });

  it("refuses when the age can't be estimated", async () => {
    fixedFaces([{ age: undefined }]);
    const err = await rejection(verifyConsentSelfie(await markedImage(), ctx()));
    expect(err.code).toBe("consent_required");
    expect(err.message).toMatch(/confirm your age/);
  });

  it("refuses sexual selfies and public figures", async () => {
    expect((await rejection(verifyConsentSelfie(await markedImage({ nsfw: true }), ctx()))).code).toBe("content_blocked");
    expect((await rejection(verifyConsentSelfie(await markedImage({ publicFigure: true }), ctx()))).code).toBe("content_blocked");
    expect(await eventsOf(user.id, "consent_failed")).toHaveLength(2);
    expect(await eventsOf(user.id, "public_figure")).toHaveLength(1);
  });

  it("fails closed when a provider throws", async () => {
    providers.face = brokenFace();
    const err = await rejection(verifyConsentSelfie(await markedImage(), ctx()));
    expect(err.details).toEqual({ categories: ["moderation_error"] });
    useMockProviders();
    providers.moderation = brokenModeration();
    await rejection(verifyConsentSelfie(await markedImage(), ctx()));
    expect(await eventsOf(user.id, "consent_failed")).toHaveLength(2);
  });
});

describe("analyzeTrainingPhotoSafety", () => {
  const alice = () => identityEmbedding("alice");

  it("passes a photo of the consenting adult", async () => {
    const result = await analyzeTrainingPhotoSafety(await markedImage({ identity: "alice", age: 28 }), alice(), ctx());
    expect(result.issues).toEqual([]);
    expect(result.faceMatchScore).toBeGreaterThan(0.9);
    expect(result.ageEstimate).toBe(28);
    expect(result.face.count).toBe(1);
  });

  it("flags a different person as face_mismatch with a plain-language fix", async () => {
    const result = await analyzeTrainingPhotoSafety(await markedImage({ identity: "bob" }), alice(), ctx());
    expect(result.faceMatchScore).toBeLessThan(0.6);
    expect(result.issues).toContainEqual({
      code: "face_mismatch",
      severity: "error",
      message: "This doesn't look like the person in your consent selfie.",
      fix: "Only upload photos of yourself.",
    });
  });

  it("records a face_mismatch event", async () => {
    await analyzeTrainingPhotoSafety(await markedImage({ identity: "bob" }), alice(), ctx());
    const [event] = await eventsOf(user.id, "face_mismatch");
    expect(event).toMatchObject({ modelId: "mdl_x" });
    expect(event!.details).toMatchObject({ threshold: 0.6 });
  });

  it("flags minors and records underage", async () => {
    const result = await analyzeTrainingPhotoSafety(await markedImage({ identity: "alice", age: 15 }), alice(), ctx());
    expect(result.ageEstimate).toBe(15);
    expect(result.issues.map((i) => i.code)).toEqual(["underage"]);
    expect(await eventsOf(user.id, "underage")).toHaveLength(1);
  });

  it("flags no face and multiple faces", async () => {
    const none = await analyzeTrainingPhotoSafety(await markedImage({ faces: 0 }), alice(), ctx());
    expect(none.issues.map((i) => i.code)).toEqual(["no_face"]);
    expect(none.faceMatchScore).toBeNull();
    const many = await analyzeTrainingPhotoSafety(await markedImage({ identity: "alice", faces: 3 }), alice(), ctx());
    expect(many.issues.map((i) => i.code)).toContain("multiple_faces");
    expect(many.face.count).toBe(3);
  });

  it("uses the youngest face for the age estimate", async () => {
    fixedFaces([
      { age: 40, box: { x: 0, y: 0, width: 50, height: 50 } },
      { age: 16, embedding: identityEmbedding("bob") },
    ]);
    const result = await analyzeTrainingPhotoSafety(await markedImage(), alice(), ctx());
    expect(result.ageEstimate).toBe(16);
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["multiple_faces", "underage"]));
    expect(result.faceMatchScore).toBeGreaterThan(0.9); // main (largest) face is alice
  });

  it("flags nsfw photos and records the block", async () => {
    const result = await analyzeTrainingPhotoSafety(await markedImage({ identity: "alice", nsfw: true }), alice(), ctx());
    expect(result.issues.map((i) => i.code)).toEqual(["nsfw"]);
    expect(await eventsOf(user.id, "reference_blocked")).toHaveLength(1);
  });

  it("fails closed when providers throw", async () => {
    providers.face = brokenFace();
    const result = await analyzeTrainingPhotoSafety(await markedImage(), alice(), ctx());
    expect(result.issues.map((i) => i.code)).toEqual(["unreadable"]);
    expect(result.faceMatchScore).toBeNull();
  });

  it("treats incomparable embeddings as a mismatch", async () => {
    const result = await analyzeTrainingPhotoSafety(await markedImage({ identity: "alice" }), [0.6, 0.8], ctx());
    expect(result.faceMatchScore).toBeNull();
    expect(result.issues.map((i) => i.code)).toEqual(["face_mismatch"]);
  });

  it("requires a consent embedding", async () => {
    const err = await rejection(analyzeTrainingPhotoSafety(await markedImage(), [], ctx()));
    expect(err.code).toBe("consent_required");
  });
});

describe("likenessScore", () => {
  it("scores the same person high and a different person low (0..1)", async () => {
    const same = await likenessScore(await markedImage({ identity: "alice" }), identityEmbedding("alice"));
    const other = await likenessScore(await markedImage({ identity: "bob" }), identityEmbedding("alice"));
    expect(same).toBeGreaterThan(0.9);
    expect(same).toBeLessThanOrEqual(1);
    expect(other).toBeGreaterThanOrEqual(0);
    expect(other).toBeLessThan(0.3);
  });

  it("returns null without a face or a usable embedding", async () => {
    expect(await likenessScore(await markedImage({ faces: 0 }), identityEmbedding("alice"))).toBeNull();
    expect(await likenessScore(await markedImage(), [])).toBeNull();
    expect(await likenessScore(await markedImage(), [1, 0])).toBeNull();
  });
});
