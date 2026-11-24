import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { trainingPhotos } from "@/db/schema";
import { getStorage } from "@/server/storage";
import { getOwnedModel, identityRefFor, toModelDTO } from "@/server/models/service";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { pngBytes, useTempStorage } from "./fixtures";

vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("./registry-fallback")).fallbackRegistry),
);

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});
beforeEach(async () => {
  await createTestDb();
});

async function addPhoto(userId: string, modelId: string, status: "accepted" | "rejected", score: number) {
  const key = `users/${userId}/models/${modelId}/photos/${Math.random().toString(36).slice(2)}.jpg`;
  await getStorage().put(key, await pngBytes(), { contentType: "image/png" });
  await db.insert(trainingPhotos).values({ modelId, userId, storageKey: key, width: 64, height: 64, status, faceMatchScore: score });
}

describe("models service", () => {
  it("getOwnedModel enforces ownership and hides deleted models", async () => {
    const a = await createTestUser();
    const m = await createTestModel(a.id);
    expect((await getOwnedModel(a.id, m.id)).id).toBe(m.id);
    await expect(getOwnedModel((await createTestUser()).id, m.id)).rejects.toMatchObject({ code: "not_found" });
    const gone = await createTestModel(a.id, { deletedAt: new Date() });
    await expect(getOwnedModel(a.id, gone.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("identityRefFor: trained models use their weights; instant models send reference photos", async () => {
    const a = await createTestUser();
    const trained = await createTestModel(a.id, { providerModelRef: "mock-lora://abc", subject: "woman" });
    expect(await identityRefFor(trained)).toEqual({ modelRef: "mock-lora://abc", triggerWord: trained.triggerWord, subject: "woman" });

    const instant = await createTestModel(a.id, { providerModelRef: null, metadata: { mode: "instant" } });
    await expect(identityRefFor(instant)).rejects.toMatchObject({ code: "conflict" });
    for (let i = 0; i < 6; i++) await addPhoto(a.id, instant.id, i === 5 ? "rejected" : "accepted", i / 10);
    const ref = await identityRefFor(instant);
    expect(ref.modelRef).toBe("");
    expect(ref.referenceImageUrls).toHaveLength(4);

    const training = await createTestModel(a.id, { status: "training" });
    await expect(identityRefFor(training)).rejects.toMatchObject({ code: "conflict" });
  });

  it("toModelDTO counts photos and flags shared models", async () => {
    const owner = await createTestUser({ name: "Olivia Owner" });
    const viewer = await createTestUser();
    const m = await createTestModel(owner.id, { coverMediaKey: `users/${owner.id}/media/cover.jpg` });
    await addPhoto(owner.id, m.id, "accepted", 0.9);
    await addPhoto(owner.id, m.id, "rejected", 0.1);

    const own = await toModelDTO(m, owner.id);
    expect(own).toMatchObject({ id: m.id, photoCount: 2, acceptedPhotoCount: 1, shared: false, consentVerified: true, status: "ready" });
    expect(own.coverUrl).toMatch(/^http/);
    expect(own).not.toHaveProperty("ownerName");

    const shared = await toModelDTO(m, viewer.id);
    expect(shared).toMatchObject({ shared: true, ownerName: "Olivia Owner" });
  });
});
