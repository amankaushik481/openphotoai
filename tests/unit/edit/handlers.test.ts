import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { identityModels, jobs, media, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { setProviderOverrides } from "@/providers/registry";
import type { EditInput, InpaintInput } from "@/providers/types";
import { getBalance } from "@/server/credits/ledger";
import editHandler, { EDIT_IDENTITY_REFS } from "@/server/jobs/handlers/edit";
import inpaintHandler, { normalizedMaskKey } from "@/server/jobs/handlers/inpaint";
import poseCopyHandler, { DEFAULT_POSE_DIRECTION, POSE_IDENTITY_REFS } from "@/server/jobs/handlers/pose-copy";
import { createJob, syncJob, toJobDTO } from "@/server/jobs/engine";
import { getStorage } from "@/server/storage";
import { editJobInput, inpaintJobInput, poseCopyJobInput, type JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { BLOCKED_WORD, overrideMockAI, pngBytes, resetSafety, safetyMock, useTempStorage } from "../jobs/fixtures";
import { createMaskUpload, createReferenceUpload, createStoredMedia, describePng, maskPng } from "./helpers";

vi.mock("@/server/safety", async () => (await import("../jobs/fixtures")).safetyMock);
vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("../jobs/registry-fallback")).fallbackRegistry),
);

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let u: UserRow;
let model: IdentityModelRow;
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  u = await createTestUser({ credits: 30, plan: "pro", hasPaid: true });
  model = await createTestModel(u.id, { subject: "woman" });
});
afterEach(() => {
  setProviderOverrides(null);
  vi.restoreAllMocks();
});

/** Mock AI provider that records what submitEdit / submitInpaint received. */
function recordingProvider() {
  const provider = overrideMockAI();
  const edits: EditInput[] = [];
  const inpaints: InpaintInput[] = [];
  const { submitEdit, submitInpaint } = provider;
  provider.submitEdit = async (input, opts) => {
    edits.push(input);
    return submitEdit(input, opts);
  };
  provider.submitInpaint = async (input, opts) => {
    inpaints.push(input);
    return submitInpaint(input, opts);
  };
  return { edits, inpaints };
}

async function addAcceptedPhoto(m: IdentityModelRow) {
  const key = `users/${m.userId}/models/${m.id}/photos/${Math.random().toString(36).slice(2)}.jpg`;
  await getStorage().put(key, await pngBytes(), { contentType: "image/png" });
  await db.insert(trainingPhotos).values({ modelId: m.id, userId: m.userId, storageKey: key, width: 64, height: 64, status: "accepted" });
}

const editInput = (over: Partial<JobInput & { type: "edit" }> = {}) =>
  editJobInput.parse({ type: "edit", sourceMediaId: "med_missing", edit: "outfit", instruction: "a navy suit", ...over });

/* ───────────────────────────── edit ───────────────────────────── */

describe("edit handler", () => {
  it("plans an identity-preserving instruction edit of the user's own photo", async () => {
    const source = await createStoredMedia(u.id, { modelId: model.id });
    const plan = await editHandler.plan({ user: u, input: editInput({ sourceMediaId: source.id, numImages: 2 }) });
    expect(plan.modelId).toBe(model.id);
    expect(plan.sourceMediaId).toBe(source.id);
    expect(plan.textsToModerate).toEqual(["a navy suit"]);
    expect(plan.data).toMatchObject({
      edit: "outfit",
      numImages: 2,
      parentMediaId: source.id,
      scoreLikeness: true,
      sourceKey: source.storageKey,
    });
    expect(plan.data.prompt).toContain("a navy suit");
    expect(plan.data.prompt).toContain("the woman");
    expect(plan.credits).toBeUndefined();
  });

  it("treats another user's media as not found", async () => {
    const other = await createTestUser();
    const theirs = await createStoredMedia(other.id);
    await expect(editHandler.plan({ user: u, input: editInput({ sourceMediaId: theirs.id }) })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects videos and deleted media", async () => {
    const video = await createStoredMedia(u.id, { kind: "video", mimeType: "video/mp4" });
    await expect(editHandler.plan({ user: u, input: editInput({ sourceMediaId: video.id }) })).rejects.toMatchObject({
      code: "validation_error",
    });
    const gone = await createStoredMedia(u.id, { deletedAt: new Date() });
    await expect(editHandler.plan({ user: u, input: editInput({ sourceMediaId: gone.id }) })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("proceeds without identity when the source's model is deleted, unfinished or not the user's", async () => {
    const deleted = await createTestModel(u.id, { deletedAt: new Date() });
    const training = await createTestModel(u.id, { status: "training" });
    const other = await createTestUser();
    const foreign = await createTestModel(other.id);
    for (const m of [deleted, training, foreign]) {
      const source = await createStoredMedia(u.id, { modelId: m.id });
      const plan = await editHandler.plan({ user: u, input: editInput({ sourceMediaId: source.id }) });
      expect(plan.modelId).toBeNull();
      expect(plan.data.prompt).toContain("the person");
    }
  });

  it("rejects an instruction that is only punctuation", async () => {
    const source = await createStoredMedia(u.id, { modelId: model.id });
    await expect(
      editHandler.plan({ user: u, input: editInput({ sourceMediaId: source.id, instruction: "!!!" }) }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("runs the full lifecycle: charge, instruct submit with identity refs, media linked to the source", async () => {
    await addAcceptedPhoto(model);
    await addAcceptedPhoto(model);
    await addAcceptedPhoto(model);
    const { edits } = recordingProvider();
    const source = await createStoredMedia(u.id, { modelId: model.id });

    const job = await createJob(u, editInput({ sourceMediaId: source.id, edit: "background", instruction: "studio grey backdrop", numImages: 2 }));
    expect(job.status).toBe("running");
    expect(job.creditsCharged).toBe(4);
    expect(job.sourceMediaId).toBe(source.id);
    expect(job.modelId).toBe(model.id);
    expect(await getBalance(u.id)).toBe(26);
    expect(safetyMock.assertTextAllowed).toHaveBeenCalledWith(["studio grey backdrop"], expect.anything());

    expect(edits).toHaveLength(1);
    const sent = edits[0]!;
    expect(sent.mode).toBe("instruct");
    expect(sent.imageUrls).toHaveLength(1);
    expect(sent.numImages).toBe(2);
    expect(sent.prompt).toContain("Replace only the background");
    expect(sent.identity?.triggerWord).toBe(model.triggerWord);
    expect(sent.identity?.referenceImageUrls).toHaveLength(EDIT_IDENTITY_REFS);

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const rows = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.parentMediaId).toBe(source.id);
      expect(row.modelId).toBe(model.id);
      expect(row.userId).toBe(u.id);
      expect(row.prompt).toContain("studio grey backdrop");
    }
    const dto = await toJobDTO(done);
    expect(dto.media.map((m) => m.parentMediaId)).toEqual([source.id, source.id]);
    expect(await getBalance(u.id)).toBe(26);
  });

  it("submits without identity when the model was deleted after planning", async () => {
    const { edits } = recordingProvider();
    const source = await createStoredMedia(u.id, { modelId: model.id });
    const plan = await editHandler.plan({ user: u, input: editInput({ sourceMediaId: source.id }) });
    await db.update(identityModels).set({ deletedAt: new Date() }).where(eq(identityModels.id, model.id));
    const [job] = await db
      .insert(jobs)
      .values({ userId: u.id, type: "edit", status: "queued", input: editInput({ sourceMediaId: source.id }) })
      .returning();
    await editHandler.submit({ user: u, job: job!, input: editInput({ sourceMediaId: source.id }), plan, submitOpts: {} });
    expect(edits[0]!.identity).toBeUndefined();
  });

  it("blocks unsafe instructions before charging", async () => {
    const source = await createStoredMedia(u.id, { modelId: model.id });
    await expect(createJob(u, editInput({ sourceMediaId: source.id, instruction: `wearing ${BLOCKED_WORD}` }))).rejects.toMatchObject({
      code: "content_blocked",
    });
    expect(await getBalance(u.id)).toBe(30);
    expect(await db.select().from(jobs)).toHaveLength(0);
  });
});

/* ───────────────────────────── inpaint ───────────────────────────── */

const inpaintInput = (sourceMediaId: string, maskUploadId: string, prompt = "a red scarf") =>
  inpaintJobInput.parse({ type: "inpaint", sourceMediaId, maskUploadId, prompt });

describe("inpaint handler", () => {
  it("enforces mask purpose and ownership", async () => {
    const source = await createStoredMedia(u.id, { modelId: model.id });
    const reference = await createMaskUpload(u.id, 400, 500, { purpose: "reference" });
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(source.id, reference.id) })).rejects.toMatchObject({
      code: "not_found",
    });
    const other = await createTestUser();
    const theirMask = await createMaskUpload(other.id, 400, 500);
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(source.id, theirMask.id) })).rejects.toMatchObject({
      code: "not_found",
    });
    const theirPhoto = await createStoredMedia(other.id);
    const mine = await createMaskUpload(u.id, 400, 500);
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(theirPhoto.id, mine.id) })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects video sources", async () => {
    const video = await createStoredMedia(u.id, { kind: "video", mimeType: "video/mp4" });
    const mask = await createMaskUpload(u.id, 400, 500);
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(video.id, mask.id) })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("requires the mask to match the photo's aspect ratio within 2%", async () => {
    const source = await createStoredMedia(u.id, { width: 400, height: 500 });
    const close = await createMaskUpload(u.id, 400, 507); // 1.4% off
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(source.id, close.id) })).resolves.toBeTruthy();
    const off = await createMaskUpload(u.id, 400, 520); // 3.8% off
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(source.id, off.id) })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("rejects an empty mask", async () => {
    const source = await createStoredMedia(u.id);
    const empty = await createMaskUpload(u.id, 400, 500, { bytes: await maskPng(400, 500, null) });
    await expect(inpaintHandler.plan({ user: u, input: inpaintInput(source.id, empty.id) })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("uses an exact-size opaque mask as-is", async () => {
    const source = await createStoredMedia(u.id, { modelId: model.id });
    const mask = await createMaskUpload(u.id, 400, 500);
    const plan = await inpaintHandler.plan({ user: u, input: inpaintInput(source.id, mask.id) });
    expect(plan.modelId).toBe(model.id);
    expect(plan.sourceMediaId).toBe(source.id);
    expect(plan.textsToModerate).toEqual(["a red scarf"]);
    expect(plan.data).toMatchObject({ normalizeMask: false, width: 400, height: 500, parentMediaId: source.id, scoreLikeness: true });
    expect(plan.data.prompt).toMatch(/^a red scarf, seamlessly blended/);
  });

  it("resizes a same-aspect mask of another size to the photo's pixels and runs the lifecycle", async () => {
    const { inpaints } = recordingProvider();
    const source = await createStoredMedia(u.id, { modelId: model.id, width: 400, height: 500 });
    const mask = await createMaskUpload(u.id, 200, 250, { bytes: await maskPng(200, 250, { x: 50, y: 50, w: 60, h: 60 }, { alpha: true }) });

    const job = await createJob(u, inpaintInput(source.id, mask.id, "add round glasses"));
    expect(job.status).toBe("running");
    expect(job.creditsCharged).toBe(2);
    expect((job.output?.plan as { normalizeMask: boolean }).normalizeMask).toBe(true);

    const normalized = await getStorage().get(normalizedMaskKey(u.id, mask.id, { width: 400, height: 500 }));
    const info = await describePng(normalized);
    expect(info).toMatchObject({ width: 400, height: 500, levels: [0, 255] });

    const sent = inpaints[0]!;
    expect(sent.prompt).toContain("add round glasses");
    expect(sent.identity?.triggerWord).toBe(model.triggerWord);
    expect(sent.identity?.referenceImageUrls).toBeUndefined();
    expect(sent.imageUrl).not.toBe(sent.maskUrl);

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const rows = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.parentMediaId).toBe(source.id);
    expect(rows[0]!.modelId).toBe(model.id);
  });
});

/* ───────────────────────────── pose copy ───────────────────────────── */

const poseInput = (referenceUploadId: string, over: Record<string, unknown> = {}) =>
  poseCopyJobInput.parse({ type: "pose_copy", modelId: model.id, referenceUploadId, ...over });

describe("pose copy handler", () => {
  it("requires the user's own ready model", async () => {
    const reference = await createReferenceUpload(u.id);
    const other = await createTestUser();
    const foreign = await createTestModel(other.id);
    await expect(poseCopyHandler.plan({ user: u, input: poseInput(reference.id, { modelId: foreign.id }) })).rejects.toMatchObject({
      code: "not_found",
    });
    const training = await createTestModel(u.id, { status: "training" });
    await expect(poseCopyHandler.plan({ user: u, input: poseInput(reference.id, { modelId: training.id }) })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("only accepts the user's own reference uploads", async () => {
    const mask = await createReferenceUpload(u.id, 600, 800, "mask");
    await expect(poseCopyHandler.plan({ user: u, input: poseInput(mask.id) })).rejects.toMatchObject({ code: "not_found" });
    const other = await createTestUser();
    const theirs = await createReferenceUpload(other.id);
    await expect(poseCopyHandler.plan({ user: u, input: poseInput(theirs.id) })).rejects.toMatchObject({ code: "not_found" });
  });

  it("moderates the extra prompt and derives the aspect ratio from the reference", async () => {
    const reference = await createReferenceUpload(u.id, 900, 1600);
    const withPrompt = await poseCopyHandler.plan({ user: u, input: poseInput(reference.id, { prompt: "{subject} in a red dress" }) });
    expect(withPrompt.textsToModerate).toEqual(["{subject} in a red dress"]);
    expect(withPrompt.data).toMatchObject({ aspectRatio: "9:16", numImages: 2, scoreLikeness: true });
    expect(withPrompt.data.prompt).toBe(`${model.triggerWord} woman in a red dress`);

    const plain = await poseCopyHandler.plan({ user: u, input: poseInput(reference.id, { aspectRatio: "1:1" }) });
    expect(plain.textsToModerate).toEqual([]);
    expect(plain.data).toMatchObject({ aspectRatio: "1:1", prompt: DEFAULT_POSE_DIRECTION });
  });

  it("runs the full lifecycle with the reference first and identity reference photos", async () => {
    for (let i = 0; i < 5; i++) await addAcceptedPhoto(model);
    const { edits } = recordingProvider();
    const reference = await createReferenceUpload(u.id, 600, 800);

    const job = await createJob(u, poseInput(reference.id, { numImages: 3 }));
    expect(job.creditsCharged).toBe(6);
    expect(job.modelId).toBe(model.id);
    const sent = edits[0]!;
    expect(sent.mode).toBe("pose_copy");
    expect(sent.imageUrls).toHaveLength(1);
    expect(sent.aspectRatio).toBe("3:4");
    expect(sent.identity?.referenceImageUrls).toHaveLength(POSE_IDENTITY_REFS);

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const rows = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.modelId).toBe(model.id);
      expect(row.parentMediaId).toBeNull();
    }
  });
});
