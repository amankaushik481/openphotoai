import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteModelRoute } from "@/app/api/models/[id]/route";
import { POST as trainRoute } from "@/app/api/models/[id]/train/route";
import { db } from "@/db";
import { consentRecords, emailOutbox, identityModels, jobs, media, trainingPhotos, user as userTable } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { createMockAIProvider, type MockAIProvider } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import { getBalance } from "@/server/credits/ledger";
import { normalizeImage } from "@/server/images/process";
import { syncJob } from "@/server/jobs/engine";
import { deleteModelCompletely } from "@/server/models/service";
import type { ModelView } from "@/server/models/types";
import { getStorage, storageKeys } from "@/server/storage";
import type { ApiErrorBody, JobDTO } from "@/types/domain";
import { callRoute, createTestDb, createTestMedia, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { ALICE, embeddingOf, reloadModel, selfie, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);

let storage: Awaited<ReturnType<typeof useTempStorage>>;
const normalized = new Map<string, Uint8Array>();
beforeAll(async () => {
  storage = await useTempStorage();
  for (const name of ALICE) normalized.set(name, (await normalizeImage(selfie(name))).bytes);
});
afterAll(async () => {
  await storage.cleanup();
});

let u: UserRow;
beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
  sessionMock.reset();
  u = await createTestUser({ credits: 50, plan: "pro", hasPaid: true });
  sessionMock.setUser(u);
});
afterEach(() => setProviderOverrides(null));

function overrideAI(patch: Partial<MockAIProvider>): MockAIProvider {
  const provider: MockAIProvider = { ...createMockAIProvider(), ...patch };
  setProviderOverrides({ image: provider, training: provider, video: provider });
  return provider;
}

/** A consented model in "collecting" with `count` accepted alice photos stored like the upload route does. */
async function collectingModel(count: number, photoOverrides: Partial<typeof trainingPhotos.$inferInsert> = {}): Promise<IdentityModelRow> {
  const model = await createTestModel(u.id, {
    status: "collecting",
    provider: null,
    providerModelRef: null,
    trainedAt: null,
    metadata: {},
    consentEmbedding: embeddingOf("alice"),
    consentSelfieKey: storageKeys.consentSelfie(u.id, "pending", "x"),
  });
  const selfieKey = storageKeys.consentSelfie(u.id, model.id, "cns_test");
  await getStorage().put(selfieKey, normalized.get("alice-01")!, { contentType: "image/jpeg" });
  await db.update(identityModels).set({ consentSelfieKey: selfieKey }).where(eq(identityModels.id, model.id));
  for (let i = 0; i < count; i++) {
    const id = newId("tph");
    const key = storageKeys.trainingPhoto(u.id, model.id, id);
    const thumbKey = storageKeys.trainingPhotoThumb(u.id, model.id, id);
    const bytes = normalized.get(ALICE[i % ALICE.length]!)!;
    await getStorage().put(key, bytes, { contentType: "image/jpeg" });
    await getStorage().put(thumbKey, bytes, { contentType: "image/webp" });
    await db.insert(trainingPhotos).values({
      id,
      modelId: model.id,
      userId: u.id,
      storageKey: key,
      thumbKey,
      width: 1024,
      height: 1280,
      status: "accepted",
      quality: { score: 70 + i, issues: [], metrics: { width: 1024, height: 1280, sharpness: 300, brightness: 130, contrast: 40, yaw: 0, pitch: 0 } },
      faceMatchScore: 0.97,
      ageEstimate: 29,
      ...photoOverrides,
    });
  }
  return (await reloadModel(model.id))!;
}

function train(modelId: string, mode: "instant" | "trained") {
  return callRoute<{ model: ModelView; job: JobDTO | null } & ApiErrorBody, { id: string }>(trainRoute, {
    url: `/api/models/${modelId}/train`,
    params: { id: modelId },
    body: { mode },
  });
}

async function emails(template: string) {
  return (await db.select().from(emailOutbox).where(eq(emailOutbox.userId, u.id))).filter((e) => e.template === template);
}

describe("Instant mode", () => {
  it("activates immediately without credits", async () => {
    const model = await collectingModel(3);
    const res = await train(model.id, "instant");
    expect(res.status).toBe(200);
    expect(res.json.job).toBeNull();
    expect(res.json.model).toMatchObject({ status: "ready", mode: "instant", acceptedPhotoCount: 3 });
    expect(res.json.model.coverUrl).toMatch(/^http/);
    expect(res.json.model.trainedAt).not.toBeNull();
    expect(await getBalance(u.id)).toBe(50);
    expect(await db.select().from(jobs)).toEqual([]);

    const row = (await reloadModel(model.id))!;
    expect(row.metadata.mode).toBe("instant");
    expect(row.qualitySummary).toMatchObject({ mode: "instant", accepted: 3 });
    expect((await train(model.id, "instant")).status).toBe(409);
  });

  it("needs at least 3 accepted photos", async () => {
    const model = await collectingModel(2);
    const res = await train(model.id, "instant");
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/at least 3/);
    expect((await reloadModel(model.id))!.status).toBe("collecting");
  });
});

describe("Trained mode", () => {
  it("creates a train job, debits 40 credits and completes to ready", async () => {
    const model = await collectingModel(10);
    const res = await train(model.id, "trained");
    expect(res.status).toBe(200);
    const job = res.json.job!;
    expect(job).toMatchObject({ type: "train", status: "running", creditsCharged: 40, modelId: model.id });
    expect(res.json.model).toMatchObject({ status: "training", trainingJobId: job.id, mode: "trained" });
    expect(await getBalance(u.id)).toBe(10);

    const zipKey = storageKeys.trainingZip(u.id, model.id, job.id);
    expect(await getStorage().exists(zipKey)).toBe(true);
    const { unzipSync } = await import("fflate");
    expect(Object.keys(unzipSync(await getStorage().get(zipKey)))).toHaveLength(10);

    const done = await syncJob(job.id, { force: true });
    expect(done.status).toBe("succeeded");
    expect(done.output?.modelRef).toMatch(/^mock-lora:\/\//);

    const row = (await reloadModel(model.id))!;
    expect(row).toMatchObject({ status: "ready", provider: "mock", trainingJobId: job.id });
    expect(row.providerModelRef).toBe(done.output?.modelRef);
    expect(row.providerModelRef).toContain("#alice");
    expect(row.trainedAt).toBeInstanceOf(Date);
    expect(row.coverMediaKey).toMatch(/_thumb\.webp$/);
    expect(row.qualitySummary).toMatchObject({ mode: "trained", accepted: 10 });
    expect(await getStorage().exists(zipKey)).toBe(false);
    expect(await getBalance(u.id)).toBe(10);
    expect(await emails("model_ready")).toHaveLength(1);
  });

  it("refuses without enough credits (nothing charged, model untouched)", async () => {
    await db.update(userTable).set({ credits: 10 }).where(eq(userTable.id, u.id));
    const model = await collectingModel(10);
    const res = await train(model.id, "trained");
    expect(res.status).toBe(402);
    expect(res.json.error.code).toBe("insufficient_credits");
    expect((await reloadModel(model.id))!.status).toBe("collecting");
    expect(await getBalance(u.id)).toBe(10);
  });

  it("restores collecting and refunds when training fails", async () => {
    overrideAI({ getStatus: async () => ({ state: "failed", error: "GPU on fire" }) });
    const model = await collectingModel(10);
    const { json } = await train(model.id, "trained");
    expect(await getBalance(u.id)).toBe(10);

    const failed = await syncJob(json.job!.id, { force: true });
    expect(failed).toMatchObject({ status: "failed", creditsRefunded: 40 });
    expect(await getBalance(u.id)).toBe(50);
    expect((await reloadModel(model.id))!).toMatchObject({ status: "collecting", providerModelRef: null });
    expect(await getStorage().exists(storageKeys.trainingZip(u.id, model.id, json.job!.id))).toBe(false);
    expect(await emails("training_failed")).toHaveLength(1);

    // The user can try again.
    setProviderOverrides(null);
    expect((await train(model.id, "trained")).status).toBe(200);
  });

  it("restores collecting when the provider rejects the submission", async () => {
    overrideAI({
      submitTraining: async () => {
        throw new Error("provider down");
      },
    });
    const model = await collectingModel(10);
    const res = await train(model.id, "trained");
    expect(res.status).toBe(502);
    expect(await getBalance(u.id)).toBe(50);
    expect((await reloadModel(model.id))!.status).toBe("collecting");
  });

  it("does not start a second training while one runs", async () => {
    overrideAI({ getStatus: async () => ({ state: "running", progress: 0.3 }) });
    const model = await collectingModel(10);
    expect((await train(model.id, "trained")).status).toBe(200);
    const again = await train(model.id, "trained");
    expect(again.status).toBe(409);
    expect(await db.select().from(jobs)).toHaveLength(1);
    expect(await getBalance(u.id)).toBe(10);
  });

  it("blocks training when a photo may show a minor (no credits charged)", async () => {
    const model = await collectingModel(10);
    await db.update(trainingPhotos).set({ ageEstimate: 15 }).where(eq(trainingPhotos.modelId, model.id));
    const res = await train(model.id, "trained");
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("content_blocked");
    expect(await getBalance(u.id)).toBe(50);
    expect((await reloadModel(model.id))!.status).toBe("collecting");
  });
});

describe("deleteModelCompletely", () => {
  it("deletes provider weights, storage and rows, keeps media (modelId null) and emails", async () => {
    const deleteModel = vi.fn(async () => undefined);
    overrideAI({ deleteModel });
    const model = await collectingModel(4);
    await db
      .update(identityModels)
      .set({ status: "ready", provider: "mock", providerModelRef: "mock-lora://weights#alice", metadata: { mode: "trained" } })
      .where(eq(identityModels.id, model.id));
    await db.insert(consentRecords).values({ userId: u.id, modelId: model.id, kind: "training_selfie", evidence: {} });
    const photo = await createTestMedia(u.id, { modelId: model.id });
    const prefix = storageKeys.modelPrefix(u.id, model.id);
    expect(await getStorage().exists(model.consentSelfieKey!)).toBe(true);

    const res = await callRoute(deleteModelRoute, { url: `/api/models/${model.id}`, method: "DELETE", params: { id: model.id } });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });

    expect(deleteModel).toHaveBeenCalledWith("mock-lora://weights#alice");
    expect(await reloadModel(model.id)).toBeUndefined();
    expect(await db.select().from(trainingPhotos).where(eq(trainingPhotos.modelId, model.id))).toEqual([]);
    expect(await db.select().from(consentRecords).where(eq(consentRecords.modelId, model.id))).toEqual([]);
    const [kept] = await db.select().from(media).where(eq(media.id, photo.id));
    expect(kept).toMatchObject({ id: photo.id, modelId: null });
    expect(await getStorage().exists(model.consentSelfieKey!)).toBe(false);
    const { promises: fs } = await import("node:fs");
    const left = await fs.readdir(`${storage.dir}/${prefix}`, { recursive: true }).catch(() => []);
    expect(left.filter((f) => /\.(jpg|webp|zip)$/.test(String(f)))).toEqual([]);
    expect(await emails("model_deleted")).toHaveLength(1);
  });

  it("cancels a running training first (refunded) and survives a provider deletion failure", async () => {
    overrideAI({
      getStatus: async () => ({ state: "running", progress: 0.5 }),
      deleteModel: async () => {
        throw new Error("provider API down");
      },
    });
    const model = await collectingModel(10);
    const { json } = await train(model.id, "trained");
    await db.update(identityModels).set({ provider: "mock", providerModelRef: "mock-lora://old" }).where(eq(identityModels.id, model.id));
    expect(await getBalance(u.id)).toBe(10);

    const result = await deleteModelCompletely(u.id, model.id, { notify: false });
    expect(result).toMatchObject({ providerDeleted: false, providerError: "provider API down" });
    expect(result.storageObjectsDeleted).toBeGreaterThan(0);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, json.job!.id));
    expect(job).toMatchObject({ status: "canceled", creditsRefunded: 40, modelId: null });
    expect(await getBalance(u.id)).toBe(50);
    expect(await reloadModel(model.id)).toBeUndefined();
    expect(await emails("model_deleted")).toEqual([]);
    expect(await emails("training_failed")).toEqual([]);
  });

  it("is scoped to the owner", async () => {
    const other = await createTestUser();
    const theirs = await createTestModel(other.id);
    await expect(deleteModelCompletely(u.id, theirs.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await reloadModel(theirs.id)).toBeDefined();
  });
});
