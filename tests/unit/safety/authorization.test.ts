import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { db } from "@/db";
import { modelShares, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { AppError } from "@/server/http";
import { assertModelsUsable, assertTrainingAllowed, recordModerationEvent } from "@/server/safety";
import { setStorageForTesting } from "@/server/storage";
import { brokenFace, eventsOf, identityEmbedding, markedImage, memoryStorage, providers, useMockProviders } from "./fixtures";

vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock);

const objects = new Map<string, Uint8Array>();
let user: UserRow;

beforeAll(async () => {
  await createTestDb();
  setStorageForTesting(memoryStorage(objects));
});
afterAll(() => setStorageForTesting(null));

beforeEach(async () => {
  user = await createTestUser();
  useMockProviders();
  objects.clear();
});

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

async function addPhotos(
  model: IdentityModelRow,
  count: number,
  values: { faceMatchScore?: number | null; ageEstimate?: number | null; status?: "accepted" | "rejected" | "pending" } = {},
) {
  const rows = Array.from({ length: count }, () => {
    const id = newId("tph");
    return {
      id,
      modelId: model.id,
      userId: model.userId,
      storageKey: `users/${model.userId}/models/${model.id}/photos/${id}.jpg`,
      width: 1024,
      height: 1024,
      status: values.status ?? "accepted",
      faceMatchScore: values.faceMatchScore === undefined ? 0.95 : values.faceMatchScore,
      ageEstimate: values.ageEstimate === undefined ? 30 : values.ageEstimate,
    };
  });
  return db.insert(trainingPhotos).values(rows).returning();
}

async function collectingModel(overrides: Partial<IdentityModelRow> = {}) {
  return createTestModel(user.id, {
    status: "collecting",
    consentEmbedding: identityEmbedding("alice"),
    providerModelRef: null,
    trainedAt: null,
    ...overrides,
  });
}

describe("assertTrainingAllowed", () => {
  it("allows a consented model whose accepted photos all match and are adults", async () => {
    const model = await collectingModel();
    await addPhotos(model, 10);
    await addPhotos(model, 3, { status: "rejected", faceMatchScore: 0.1, ageEstimate: 10 });
    await expect(assertTrainingAllowed(model, { userId: user.id })).resolves.toBeUndefined();
    expect(await eventsOf(user.id)).toHaveLength(0);
  });

  it("requires a verified consent selfie", async () => {
    const model = await collectingModel({ consentEmbedding: null, consentVerifiedAt: null });
    await addPhotos(model, 10);
    const err = await rejection(assertTrainingAllowed(model, { userId: user.id }));
    expect(err.code).toBe("consent_required");
    const [event] = await eventsOf(user.id, "consent_failed");
    expect(event!.modelId).toBe(model.id);
  });

  it("requires enough accepted photos for the mode", async () => {
    const trained = await collectingModel();
    await addPhotos(trained, 9);
    expect((await rejection(assertTrainingAllowed(trained, { userId: user.id }))).code).toBe("validation_error");

    const instant = await collectingModel({ metadata: { mode: "instant" } });
    await addPhotos(instant, 2);
    expect((await rejection(assertTrainingAllowed(instant, { userId: user.id }))).code).toBe("validation_error");
    await addPhotos(instant, 1);
    await expect(assertTrainingAllowed(instant, { userId: user.id })).resolves.toBeUndefined();
  });

  it("blocks when any accepted photo doesn't match the consent selfie", async () => {
    const model = await collectingModel();
    await addPhotos(model, 9);
    const [bad] = await addPhotos(model, 1, { faceMatchScore: 0.2 });
    const err = await rejection(assertTrainingAllowed(model, { userId: user.id }));
    expect(err.code).toBe("consent_required");
    expect(err.details).toEqual({ photoIds: [bad!.id] });
    expect(await eventsOf(user.id, "face_mismatch")).toHaveLength(1);
  });

  it("blocks when any accepted photo may show a minor", async () => {
    const model = await collectingModel();
    await addPhotos(model, 9);
    const [young] = await addPhotos(model, 1, { ageEstimate: 19 });
    const err = await rejection(assertTrainingAllowed(model, { userId: user.id }));
    expect(err.code).toBe("content_blocked");
    expect(err.message).toMatch(/adults only/);
    expect(err.details).toMatchObject({ photoIds: [young!.id] });
    expect(await eventsOf(user.id, "underage")).toHaveLength(1);
  });

  it("re-analyzes photos with missing values from storage and persists the result", async () => {
    const model = await collectingModel();
    await addPhotos(model, 9);
    const [stranger] = await addPhotos(model, 1, { faceMatchScore: null, ageEstimate: null });
    objects.set(stranger!.storageKey, await markedImage({ identity: "bob", age: 40 }));

    const err = await rejection(assertTrainingAllowed(model, { userId: user.id }));
    expect(err.code).toBe("consent_required");
    const [row] = await db.select().from(trainingPhotos).where(eq(trainingPhotos.id, stranger!.id));
    expect(row!.ageEstimate).toBe(40);
    expect(row!.faceMatchScore).toBeLessThan(0.6);

    // The same photo of the consenting person passes.
    objects.set(stranger!.storageKey, await markedImage({ identity: "alice", age: 40 }));
    await db.update(trainingPhotos).set({ faceMatchScore: null, ageEstimate: null }).where(eq(trainingPhotos.id, stranger!.id));
    await expect(assertTrainingAllowed(model, { userId: user.id })).resolves.toBeUndefined();
  });

  it("fails closed when a photo can't be re-checked", async () => {
    const missing = await collectingModel();
    await addPhotos(missing, 9);
    await addPhotos(missing, 1, { faceMatchScore: null, ageEstimate: null }); // not in storage
    const storageErr = await rejection(assertTrainingAllowed(missing, { userId: user.id }));
    expect(storageErr.code).toBe("content_blocked");
    expect(storageErr.details).toMatchObject({ categories: ["moderation_error"] });

    const unchecked = await collectingModel();
    await addPhotos(unchecked, 9);
    const [photo] = await addPhotos(unchecked, 1, { faceMatchScore: null, ageEstimate: null });
    objects.set(photo!.storageKey, await markedImage({ identity: "alice" }));
    providers.face = brokenFace();
    const providerErr = await rejection(assertTrainingAllowed(unchecked, { userId: user.id }));
    expect(providerErr.code).toBe("content_blocked");
    expect(providerErr.details).toEqual({ categories: ["moderation_error"], photoIds: [photo!.id] });
  });

  it("refuses to train another user's model", async () => {
    const other = await createTestUser();
    const model = await createTestModel(other.id, { status: "collecting" });
    expect((await rejection(assertTrainingAllowed(model, { userId: user.id }))).code).toBe("forbidden");
  });
});

describe("assertModelsUsable", () => {
  async function share(
    requester: UserRow,
    owner: UserRow,
    model: IdentityModelRow,
    values: Partial<typeof modelShares.$inferInsert> = {},
  ) {
    await db.insert(modelShares).values({
      requesterUserId: requester.id,
      inviteeEmail: owner.email,
      ownerUserId: owner.id,
      modelId: model.id,
      status: "accepted",
      tokenHash: newId("tok"),
      expiresAt: new Date(Date.now() + 86_400_000),
      ...values,
    });
  }

  it("returns the user's own ready models in request order", async () => {
    const a = await createTestModel(user.id);
    const b = await createTestModel(user.id);
    const models = await assertModelsUsable(user.id, [b.id, a.id, b.id]);
    expect(models.map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it("allows a model shared through an accepted, unexpired invite", async () => {
    const friend = await createTestUser();
    const mine = await createTestModel(user.id);
    const theirs = await createTestModel(friend.id);
    await share(user, friend, theirs);
    const models = await assertModelsUsable(user.id, [mine.id, theirs.id]);
    expect(models.map((m) => m.id)).toEqual([mine.id, theirs.id]);
  });

  it("forbids someone else's model without consent and records the attempt", async () => {
    const friend = await createTestUser();
    const mine = await createTestModel(user.id);
    const theirs = await createTestModel(friend.id);
    const err = await rejection(assertModelsUsable(user.id, [mine.id, theirs.id]));
    expect(err.code).toBe("forbidden");
    expect(err.message).toMatch(/needs their consent/);
    const [event] = await eventsOf(user.id, "multi_person_unauthorized");
    expect(event!.details).toMatchObject({ unauthorizedModelIds: [theirs.id] });
  });

  it.each([
    ["pending", { status: "pending" as const }],
    ["declined", { status: "declined" as const }],
    ["revoked", { status: "revoked" as const }],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
  ])("forbids a %s share", async (_label, values) => {
    const friend = await createTestUser();
    const theirs = await createTestModel(friend.id);
    await share(user, friend, theirs, values);
    expect((await rejection(assertModelsUsable(user.id, [theirs.id]))).code).toBe("forbidden");
  });

  it("forbids a share granted by someone who doesn't own the model", async () => {
    const owner = await createTestUser();
    const impostor = await createTestUser();
    const theirs = await createTestModel(owner.id);
    await share(user, impostor, theirs);
    expect((await rejection(assertModelsUsable(user.id, [theirs.id]))).code).toBe("forbidden");
  });

  it("forbids a share meant for another requester", async () => {
    const friend = await createTestUser();
    const stranger = await createTestUser();
    const theirs = await createTestModel(friend.id);
    await share(stranger, friend, theirs);
    expect((await rejection(assertModelsUsable(user.id, [theirs.id]))).code).toBe("forbidden");
  });

  it("forbids unknown and deleted models", async () => {
    const deleted = await createTestModel(user.id, { deletedAt: new Date() });
    expect((await rejection(assertModelsUsable(user.id, ["mdl_missing"]))).code).toBe("forbidden");
    expect((await rejection(assertModelsUsable(user.id, [deleted.id]))).code).toBe("forbidden");
    expect(await eventsOf(user.id, "multi_person_unauthorized")).toHaveLength(2);
  });

  it("rejects authorized models that aren't ready", async () => {
    const training = await createTestModel(user.id, { status: "training", name: "Me v2" });
    const err = await rejection(assertModelsUsable(user.id, [training.id]));
    expect(err.code).toBe("conflict");
    expect(err.message).toMatch(/Me v2/);
  });

  it("returns an empty list for no ids", async () => {
    await expect(assertModelsUsable(user.id, [])).resolves.toEqual([]);
  });
});

describe("recordModerationEvent", () => {
  it("inserts a row with the context and details", async () => {
    await recordModerationEvent("report_actioned", { userId: user.id, jobId: "job_9", modelId: "mdl_9" }, { note: "x" });
    const [event] = await eventsOf(user.id);
    expect(event).toMatchObject({
      kind: "report_actioned",
      jobId: "job_9",
      modelId: "mdl_9",
      details: { note: "x" },
      reviewed: false,
    });
  });
});
