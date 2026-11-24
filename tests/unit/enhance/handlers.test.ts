import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { MediaRow, NewMediaRow, UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { setProviderOverrides } from "@/providers/registry";
import type { UpscaleInput } from "@/providers/types";
import { getBalance } from "@/server/credits/ledger";
import { AppError } from "@/server/http";
import { readAiLabel } from "@/server/images/process";
import { createJob, syncJob, toJobDTO } from "@/server/jobs/engine";
import { getHandler } from "@/server/jobs/handlers";
import { readEnhancePlan } from "@/server/jobs/handlers/upscale";
import { getStorage, storageKeys } from "@/server/storage";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { overrideMockAI, resetSafety, safetyMock, safetyState, useTempStorage } from "../jobs/fixtures";

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
let modelId: string;
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  u = await createTestUser({ credits: 20, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
});
afterEach(() => {
  setProviderOverrides(null);
  vi.restoreAllMocks();
});

async function imageBytes(width: number, height: number, format: "jpeg" | "png" = "jpeg"): Promise<Uint8Array> {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } } });
  return Uint8Array.from(await (format === "png" ? img.png() : img.jpeg()).toBuffer());
}

/** A stored photo owned by `userId` (bytes in temp storage, row in media). */
async function storeSource(
  userId: string,
  over: Partial<NewMediaRow> = {},
  file: { width: number; height: number; format?: "jpeg" | "png" } = { width: 640, height: 800 },
): Promise<MediaRow> {
  const id = newId("med");
  const format = file.format ?? "jpeg";
  const key = storageKeys.media(userId, id, format === "png" ? "png" : "jpg");
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  await getStorage().put(key, await imageBytes(file.width, file.height, format), { contentType: mimeType });
  return createTestMedia(userId, {
    id,
    storageKey: key,
    mimeType,
    width: file.width,
    height: file.height,
    modelId,
    packId: "linkedin-headshots",
    prompt: "studio portrait of ohwx person",
    seed: 1234,
    scores: { likeness: 0.9, quality: 0.8, overall: 0.86 },
    ...over,
  });
}

const upscale = (sourceMediaId: string, scale: 2 | 4 = 2, faceRestore = true): JobInput => ({
  type: "upscale",
  sourceMediaId,
  scale,
  faceRestore,
});
const restore = (sourceMediaId: string): JobInput => ({ type: "face_restore", sourceMediaId });
const removeBg = (sourceMediaId: string): JobInput => ({ type: "remove_background", sourceMediaId });

async function outputsOf(jobId: string) {
  return db.select().from(media).where(eq(media.jobId, jobId));
}

async function planFor(input: JobInput, user: UserRow = u) {
  switch (input.type) {
    case "upscale":
      return getHandler("upscale").plan({ user, input });
    case "face_restore":
      return getHandler("face_restore").plan({ user, input });
    case "remove_background":
      return getHandler("remove_background").plan({ user, input });
    default:
      throw new Error(`not an enhancement: ${input.type}`);
  }
}

describe("plan guards", () => {
  it("only accepts the user's own, existing photos", async () => {
    const other = await createTestUser({ credits: 20 });
    const theirs = await storeSource(other.id, { modelId: null });
    for (const input of [upscale(theirs.id), restore(theirs.id), removeBg(theirs.id)]) {
      await expect(createJob(u, input)).rejects.toMatchObject({ code: "not_found" });
    }
    const deleted = await storeSource(u.id, { deletedAt: new Date() });
    await expect(createJob(u, restore(deleted.id))).rejects.toMatchObject({ code: "not_found" });
    const removed = await storeSource(u.id, { removedAt: new Date() });
    await expect(createJob(u, upscale(removed.id))).rejects.toMatchObject({ code: "not_found" });
    expect(await db.select().from(jobs)).toHaveLength(0);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("rejects videos for every enhancement", async () => {
    const video = await createTestMedia(u.id, { kind: "video", mimeType: "video/mp4", durationSec: 5 });
    for (const input of [upscale(video.id), restore(video.id), removeBg(video.id)]) {
      const err = await createJob(u, input).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ code: "validation_error", message: expect.stringMatching(/photos only/i) });
    }
    expect(await getBalance(u.id)).toBe(20);
  });

  it("refuses to upscale sources that are already 4096 px or larger", async () => {
    const big = await createTestMedia(u.id, { width: 3000, height: 4096 });
    await expect(planFor(upscale(big.id))).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "source_too_large", width: 3000, height: 4096 },
    });
    await expect(createJob(u, upscale(big.id))).rejects.toMatchObject({ code: "validation_error" });
    expect(await getBalance(u.id)).toBe(20);
  });

  it("refuses upscales whose result would exceed 8192 px, but allows a smaller factor", async () => {
    const mid = await createTestMedia(u.id, { width: 2500, height: 2000 });
    await expect(planFor(upscale(mid.id, 4))).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining("Try 2× instead"),
      details: { reason: "result_too_large" },
    });
    const plan = await planFor(upscale(mid.id, 2));
    expect(readEnhancePlan(plan.data)).toMatchObject({ sourceWidth: 2500, sourceHeight: 2000 });
  });

  it("probes the stored image when the row has no dimensions", async () => {
    const tooBig = await storeSource(u.id, { width: null, height: null }, { width: 4200, height: 16 });
    await expect(planFor(upscale(tooBig.id))).rejects.toMatchObject({ details: { reason: "source_too_large", width: 4200 } });
    const small = await storeSource(u.id, { width: null, height: null }, { width: 300, height: 200 });
    const plan = await planFor(upscale(small.id, 4));
    expect(readEnhancePlan(plan.data)).toMatchObject({ sourceWidth: 300, sourceHeight: 200 });
  });

  it("refuses background removal on an already transparent photo", async () => {
    const png = await storeSource(u.id, {}, { width: 64, height: 64, format: "png" });
    await expect(planFor(removeBg(png.id))).rejects.toMatchObject({
      code: "validation_error",
      message: "This photo already has a transparent background.",
    });
    // Other enhancements still work on it.
    await expect(planFor(upscale(png.id))).resolves.toBeTruthy();
  });

  it("links the source, its model and pack, moderates no text, and allows drafts", async () => {
    const draft = await storeSource(u.id, { isDraft: true });
    const plan = await planFor(restore(draft.id));
    expect(plan).toMatchObject({ modelId, packId: "linkedin-headshots", sourceMediaId: draft.id, textsToModerate: [] });
    expect(plan.credits).toBeUndefined();
    expect(readEnhancePlan(plan.data)).toMatchObject({
      kind: "face_restore",
      sourceMediaId: draft.id,
      sourceKey: draft.storageKey,
      sourceMime: "image/jpeg",
      sourceIsDraft: true,
      sourcePrompt: "studio portrait of ohwx person",
      sourceSeed: 1234,
      scoreLikeness: true,
    });
  });

  it("scores likeness only for face edits of sources that passed the likeness guarantee", async () => {
    const good = await storeSource(u.id);
    expect(readEnhancePlan((await planFor(upscale(good.id))).data).scoreLikeness).toBe(true);
    expect(readEnhancePlan((await planFor(removeBg(good.id))).data).scoreLikeness).toBe(false);
    const weak = await storeSource(u.id, { scores: { likeness: 0.3, overall: 0.3 } });
    expect(readEnhancePlan((await planFor(restore(weak.id))).data).scoreLikeness).toBe(false);
    const unscored = await storeSource(u.id, { scores: { quality: 0.7, overall: 0.7 } });
    expect(readEnhancePlan((await planFor(restore(unscored.id))).data).scoreLikeness).toBe(false);
  });

  it("does not link models the user no longer owns", async () => {
    const other = await createTestUser();
    const foreignModel = await createTestModel(other.id);
    const src = await storeSource(u.id, { modelId: foreignModel.id });
    const plan = await planFor(upscale(src.id));
    expect(plan.modelId).toBeNull();
    expect(readEnhancePlan(plan.data).scoreLikeness).toBe(false);
  });
});

describe("credits", () => {
  it.each([
    [upscale("x", 2), 2],
    [upscale("x", 4), 5],
    [restore("x"), 1],
    [removeBg("x"), 1],
  ] as const)("charges the configured cost for %o", async (template, cost) => {
    const src = await storeSource(u.id);
    const job = await createJob(u, { ...template, sourceMediaId: src.id } as JobInput);
    expect(job.status).toBe("running");
    expect(job.creditsCharged).toBe(cost);
    expect(job.sourceMediaId).toBe(src.id);
    expect(await getBalance(u.id)).toBe(20 - cost);
  });

  it("refunds a provider failure in full", async () => {
    overrideMockAI({ getStatus: async () => ({ state: "failed", error: "upstream exploded" }) });
    const src = await storeSource(u.id);
    const job = await createJob(u, upscale(src.id, 4));
    const done = await syncJob(job.id);
    expect(done.status).toBe("failed");
    expect(done.creditsRefunded).toBe(5);
    expect(await getBalance(u.id)).toBe(20);
  });
});

describe("lifecycle (mock provider)", () => {
  it("upscales: sends scale + face restore and stores a 2× child photo", async () => {
    const sent: UpscaleInput[] = [];
    const provider = overrideMockAI();
    const original = provider.submitUpscale;
    provider.submitUpscale = async (input, opts) => {
      sent.push(input);
      return original(input, opts);
    };
    safetyState.likeness = [0.88];
    const src = await storeSource(u.id);

    const job = await createJob(u, upscale(src.id, 2, false));
    expect(sent).toEqual([{ imageUrl: expect.any(String), scale: 2, faceRestore: false }]);
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.output).toMatchObject({ sourceMediaId: src.id, blockedCount: 0 });
    expect(done.output?.finalPrompt).toBeUndefined();

    const [out, ...rest] = await outputsOf(job.id);
    expect(rest).toHaveLength(0);
    expect(out).toMatchObject({
      userId: u.id,
      kind: "image",
      parentMediaId: src.id,
      modelId,
      packId: "linkedin-headshots",
      prompt: src.prompt,
      seed: 1234,
      isDraft: false,
      hidden: false,
      mimeType: "image/jpeg",
      width: 1280,
      height: 1600,
    });
    expect(out!.scores?.likeness).toBe(0.88);
    expect(safetyMock.likenessScore).toHaveBeenCalledTimes(1);
    expect(await readAiLabel(await getStorage().get(out!.storageKey))).not.toBeNull();

    const dto = await toJobDTO(done);
    expect(dto.media).toHaveLength(1);
    expect(dto.media[0]!.parentMediaId).toBe(src.id);
    expect(await getBalance(u.id)).toBe(18);
  });

  it("face restore: a low-likeness result is refunded but never hidden", async () => {
    safetyState.likeness = [0.2];
    const src = await storeSource(u.id);
    const job = await createJob(u, restore(src.id));
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.creditsRefunded).toBe(1);
    const [out] = await outputsOf(job.id);
    expect(out).toMatchObject({ parentMediaId: src.id, hidden: false });
    expect(out!.scores?.likeness).toBe(0.2);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("face restore of a weak-likeness source is not scored (no free re-rolls)", async () => {
    safetyState.defaultLikeness = 0.1;
    const src = await storeSource(u.id, { scores: { likeness: 0.3, overall: 0.3 } });
    const job = await createJob(u, restore(src.id));
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.creditsRefunded).toBe(0);
    expect(safetyMock.likenessScore).not.toHaveBeenCalled();
    const [out] = await outputsOf(job.id);
    expect(out!.hidden).toBe(false);
    expect(out!.scores?.likeness).toBeUndefined();
  });

  it("remove background keeps a transparent PNG, even with the free-tier watermark", async () => {
    const free = await createTestUser({ credits: 5, plan: "free", hasPaid: false });
    const freeModel = await createTestModel(free.id);
    const src = await storeSource(free.id, { modelId: freeModel.id });
    const job = await createJob(free, removeBg(src.id));
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(safetyMock.likenessScore).not.toHaveBeenCalled();

    const [out] = await outputsOf(job.id);
    expect(out).toMatchObject({
      parentMediaId: src.id,
      modelId: freeModel.id,
      mimeType: "image/png",
      watermarked: true,
      hidden: false,
      width: 640,
      height: 800,
    });
    expect(out!.storageKey).toMatch(/\.png$/);
    const bytes = await getStorage().get(out!.storageKey);
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect((await sharp(bytes).stats()).isOpaque).toBe(false);
    expect(await readAiLabel(bytes)).not.toBeNull();
    expect(await getStorage().exists(out!.thumbKey!)).toBe(true);
    expect(await getBalance(free.id)).toBe(4);

    // The transparent result can't have its background removed again.
    await expect(createJob(free, removeBg(out!.id))).rejects.toMatchObject({ code: "validation_error" });
  });

  it("a blocked output blocks the job and refunds it", async () => {
    overrideMockAI({
      getStatus: async () => ({ state: "succeeded", output: { images: [{ url: "mock://image/x/0", nsfw: true }] } }),
    });
    const src = await storeSource(u.id);
    const job = await createJob(u, upscale(src.id, 4));
    const done = await syncJob(job.id);
    expect(done.status).toBe("blocked");
    expect(done.creditsRefunded).toBe(5);
    expect(await outputsOf(job.id)).toHaveLength(0);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("completion fails fast (no retries) and refunds when the provider returns no image", async () => {
    const src = await storeSource(u.id);
    const job = await createJob(u, restore(src.id));
    const handler = getHandler("face_restore");
    const plan = job.output?.plan as Record<string, unknown>;
    await expect(handler.complete!({ job, output: { images: [] }, plan })).rejects.toMatchObject({
      message: expect.stringMatching(/no image/),
      retryable: false,
    });

    const provider = overrideMockAI();
    provider.getStatus = async () => ({ state: "succeeded", output: { images: [] } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const done = await syncJob(job.id, { force: true });
    expect(done).toMatchObject({ status: "failed", attempts: 1, errorCode: "internal" });
    expect(done.creditsRefunded).toBe(done.creditsCharged);
    expect(await getBalance(u.id)).toBe(20);
  });
});
