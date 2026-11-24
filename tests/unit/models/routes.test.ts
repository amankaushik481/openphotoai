import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { POST as challengeRoute } from "@/app/api/models/[id]/consent/challenge/route";
import { POST as consentRoute } from "@/app/api/models/[id]/consent/route";
import { DELETE as deletePhotoRoute } from "@/app/api/models/[id]/photos/[photoId]/route";
import { POST as photosRoute } from "@/app/api/models/[id]/photos/route";
import { DELETE as deleteModelRoute, GET as getModelRoute, PATCH as patchModelRoute } from "@/app/api/models/[id]/route";
import { POST as trainRoute } from "@/app/api/models/[id]/train/route";
import { GET as listModelsRoute, POST as createModelRoute } from "@/app/api/models/route";
import { db } from "@/db";
import { consentRecords, identityModels, modelShares, trainingPhotos } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { resetEnvCache } from "@/lib/env";
import { newId } from "@/lib/ids";
import { setProviderOverrides } from "@/providers/registry";
import { CONSENT_CHALLENGE_TTL_SEC } from "@/server/models/consent";
import type { AddPhotoResponse, ConsentChallengeResponse, ModelDetailResponse, ModelView } from "@/server/models/types";
import type { ApiErrorBody } from "@/types/domain";
import { getStorage, storageKeys } from "@/server/storage";
import { callRoute, createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { appendLivenessFrames, livenessFrames } from "../../helpers/liveness";
import { imageForm, reloadModel, selfie, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);

let storage: Awaited<ReturnType<typeof useTempStorage>>;
beforeAll(async () => {
  storage = await useTempStorage();
});
afterAll(async () => {
  await storage.cleanup();
});

let u: UserRow;
beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
  sessionMock.reset();
  u = await createTestUser({ credits: 0, plan: "pro" });
  sessionMock.setUser(u);
});
afterEach(() => {
  vi.useRealTimers();
});

async function createModel(name = "Me"): Promise<ModelView> {
  const res = await callRoute(createModelRoute, { url: "/api/models", body: { name, subject: "woman" } });
  expect(res.status).toBe(200);
  return res.json.model as ModelView;
}

async function challenge(modelId: string): Promise<ConsentChallengeResponse> {
  const res = await callRoute<ConsentChallengeResponse, { id: string }>(challengeRoute, {
    url: `/api/models/${modelId}/consent/challenge`,
    method: "POST",
    params: { id: modelId },
  });
  expect(res.status).toBe(200);
  return res.json;
}

async function postConsent(modelId: string, name: string, captureToken: string, steps: ConsentChallengeResponse["steps"] = []) {
  const frontal = selfie(name);
  const form = appendLivenessFrames(imageForm("selfie", frontal, { captureToken }), await livenessFrames(frontal, steps));
  return callRoute(consentRoute, {
    url: `/api/models/${modelId}/consent`,
    params: { id: modelId },
    body: form,
    headers: { "user-agent": "vitest-camera", "x-forwarded-for": "203.0.113.7" },
  });
}

async function consent(modelId: string, name = "alice-01") {
  const { captureToken, steps } = await challenge(modelId);
  return postConsent(modelId, name, captureToken, steps);
}

function upload(modelId: string, bytes: Uint8Array<ArrayBuffer>) {
  return callRoute<AddPhotoResponse & ApiErrorBody, { id: string }>(photosRoute, {
    url: `/api/models/${modelId}/photos`,
    params: { id: modelId },
    body: imageForm("file", bytes),
  });
}

async function storedKeys(prefix: string): Promise<string[]> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(storage.dir, prefix);
  try {
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => path.relative(storage.dir, path.join(e.parentPath, e.name)));
  } catch {
    return [];
  }
}

describe("models CRUD", () => {
  it("creates, lists, renames and reads a model", async () => {
    const model = await createModel("Studio me");
    expect(model).toMatchObject({ name: "Studio me", subject: "woman", status: "awaiting_consent", consentVerified: false, shared: false, mode: "trained" });
    expect(model.triggerWord).toMatch(/^ohwx[a-z]{6}$/);

    const list = await callRoute(listModelsRoute, { url: "/api/models" });
    expect(list.json.models.map((m: ModelView) => m.id)).toEqual([model.id]);

    const renamed = await callRoute(patchModelRoute, { url: `/api/models/${model.id}`, method: "PATCH", params: { id: model.id }, body: { name: "  New name " } });
    expect(renamed.json.model.name).toBe("New name");

    const detail = await callRoute<ModelDetailResponse, { id: string }>(getModelRoute, { url: `/api/models/${model.id}`, params: { id: model.id } });
    expect(detail.status).toBe(200);
    expect(detail.json.photos).toEqual([]);
    expect(detail.json.readiness).toMatchObject({ accepted: 0, minRequired: 10, canTrain: false });
    expect(detail.json.readiness.blockers).toContain("Take your live consent selfie first.");
    expect(detail.json.readinessByMode.instant.minRequired).toBe(3);
  });

  it("validates the body and enforces the plan's model limit", async () => {
    expect((await callRoute(createModelRoute, { url: "/api/models", body: { name: "", subject: "man" } })).status).toBe(400);
    const free = await createTestUser({ plan: "free" });
    sessionMock.setUser(free);
    await createModel();
    const res = await callRoute(createModelRoute, { url: "/api/models", body: { name: "Second", subject: "man" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("plan_limit");
  });

  it("lists models shared with me as read-only", async () => {
    const owner = await createTestUser({ name: "Bea" });
    const theirs = await createTestModel(owner.id, { name: "Bea's model" });
    await db.insert(modelShares).values({
      requesterUserId: u.id,
      inviteeEmail: owner.email,
      ownerUserId: owner.id,
      modelId: theirs.id,
      status: "accepted",
      tokenHash: newId("hash"),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // An unrelated model of the same owner stays invisible.
    const hidden = await createTestModel(owner.id);

    const list = await callRoute(listModelsRoute, { url: "/api/models" });
    expect(list.json.models).toEqual([expect.objectContaining({ id: theirs.id, shared: true, ownerName: "Bea" })]);

    const detail = await callRoute<ModelDetailResponse, { id: string }>(getModelRoute, { url: `/api/models/${theirs.id}`, params: { id: theirs.id } });
    expect(detail.status).toBe(200);
    expect(detail.json.model.shared).toBe(true);
    expect(detail.json.photos).toEqual([]);

    for (const id of [theirs.id, hidden.id]) {
      const patch = await callRoute(patchModelRoute, { url: `/api/models/${id}`, method: "PATCH", params: { id }, body: { name: "x" } });
      expect(patch.status).toBe(404);
      expect((await callRoute(deleteModelRoute, { url: `/api/models/${id}`, method: "DELETE", params: { id } })).status).toBe(404);
    }
    expect((await callRoute(getModelRoute, { url: `/api/models/${hidden.id}`, params: { id: hidden.id } })).status).toBe(404);
  });
});

describe("live consent selfie", () => {
  it("verifies the selfie, stores it privately and records consent", async () => {
    // Behind one trusted proxy, its X-Forwarded-For entry is the consent IP (SEC-4).
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    resetEnvCache();
    onTestFinished(() => {
      vi.unstubAllEnvs();
      resetEnvCache();
    });
    const model = await createModel();
    const res = await consent(model.id);
    expect(res.status).toBe(200);
    expect(res.json.model).toMatchObject({ status: "collecting", consentVerified: true });

    const row = (await reloadModel(model.id))!;
    expect(row.consentEmbedding).toHaveLength(128);
    expect(row.consentSelfieKey).toMatch(new RegExp(`^${storageKeys.modelPrefix(u.id, model.id)}consent/cns_.+\\.jpg$`));
    expect(await getStorage().exists(row.consentSelfieKey!)).toBe(true);
    expect(row.metadata.consentChallenge).toBeUndefined();

    const [record] = await db.select().from(consentRecords).where(eq(consentRecords.modelId, model.id));
    expect(record).toMatchObject({ userId: u.id, kind: "training_selfie", ipAddress: "203.0.113.7", userAgent: "vitest-camera" });
    expect(record!.evidence).toMatchObject({
      captureMethod: "camera+active-liveness",
      age: 29,
      faceConfidence: 0.99,
      liveness: { method: "active_head_pose", poseVerified: true, faceProvider: "mock" },
    });
  });

  it("requires a capture token issued by the challenge endpoint (single use)", async () => {
    const model = await createModel();
    const missing = await postConsent(model.id, "alice-01", "");
    expect(missing.status).toBe(422);
    expect(missing.json.error.code).toBe("consent_required");

    const { captureToken, steps } = await challenge(model.id);
    expect((await postConsent(model.id, "alice-01", "forged-token", steps)).status).toBe(422);
    expect((await postConsent(model.id, "alice-01", captureToken, steps)).status).toBe(200);
    const reused = await postConsent(model.id, "alice-01", captureToken, steps);
    expect(reused.status).toBe(422);
    expect(reused.json.error.code).toBe("consent_required");
  });

  it("expires capture tokens after 5 minutes", async () => {
    const model = await createModel();
    const { captureToken, expiresAt, steps } = await challenge(model.id);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan((CONSENT_CHALLENGE_TTL_SEC - 5) * 1000);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + (CONSENT_CHALLENGE_TTL_SEC + 1) * 1000 });
    const res = await postConsent(model.id, "alice-01", captureToken, steps);
    expect(res.status).toBe(422);
    expect(res.json.error.message).toMatch(/expired/);
    expect((await reloadModel(model.id))!.status).toBe("awaiting_consent");
  });

  it("rejects a minor's selfie, and the model can't be trained", async () => {
    const model = await createModel();
    const res = await consent(model.id, "teen-01");
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("content_blocked");
    expect((await reloadModel(model.id))!).toMatchObject({ status: "awaiting_consent", consentEmbedding: null });
    expect(await storedKeys(storageKeys.modelPrefix(u.id, model.id))).toEqual([]);

    const train = await callRoute(trainRoute, { url: `/api/models/${model.id}/train`, params: { id: model.id }, body: { mode: "instant" } });
    expect(train.status).toBe(400);
    const upload1 = await upload(model.id, selfie("alice-02"));
    expect(upload1.json.error.code).toBe("consent_required");
  });

  it("allows retaking consent only while the model has no photos", async () => {
    const model = await createModel();
    await consent(model.id, "alice-01");
    const first = (await reloadModel(model.id))!.consentSelfieKey!;
    expect((await consent(model.id, "alice-11")).status).toBe(200);
    // The previous selfie is replaced, not kept.
    expect(await getStorage().exists(first)).toBe(false);

    expect((await upload(model.id, selfie("alice-02"))).status).toBe(200);
    const res = await callRoute(challengeRoute, { url: `/api/models/${model.id}/consent/challenge`, method: "POST", params: { id: model.id } });
    expect(res.status).toBe(409);
  });
});

describe("training photos", () => {
  it("accepts the consenting person's photos and rejects everything else for the right reason", async () => {
    const model = await createModel();
    await consent(model.id, "alice-01");

    for (const [i, name] of ["alice-02", "alice-03", "alice-04"].entries()) {
      const res = await upload(model.id, selfie(name));
      expect(res.status).toBe(200);
      expect(res.json.photo).toMatchObject({ status: "accepted" });
      expect(res.json.photo.quality?.issues.filter((x) => x.severity === "error")).toEqual([]);
      expect(res.json.photo.thumbUrl).toMatch(/^http/);
      expect(res.json.readiness.accepted).toBe(i + 1);
      expect(res.json.readinessByMode.instant.canTrain).toBe(i + 1 >= 3);
    }

    // Safety rejections are answered with the reason + fix and never stored.
    const before = await storedKeys(storageKeys.modelPrefix(u.id, model.id));
    const bob = await upload(model.id, selfie("bob-01"));
    expect(bob.status).toBe(422);
    expect(bob.json.error).toMatchObject({ code: "consent_required", details: { issue: "face_mismatch", stored: false } });
    expect(bob.json.error.message).toMatch(/Only upload photos of yourself/);
    const teen = await upload(model.id, selfie("teen-01"));
    expect(teen.json.error).toMatchObject({ code: "content_blocked", details: { issue: "underage" } });
    const nsfw = await upload(model.id, selfie("nsfw-01"));
    expect(nsfw.json.error).toMatchObject({ code: "content_blocked", details: { issue: "nsfw" } });
    const group = await upload(model.id, selfie("group-01"));
    expect(group.json.error).toMatchObject({ code: "validation_error", details: { issue: "multiple_faces" } });
    expect(await storedKeys(storageKeys.modelPrefix(u.id, model.id))).toEqual(before);

    // Technical rejections are kept (so the user sees why) but never count as accepted.
    const blurry = await upload(model.id, selfie("blurry-01"));
    expect(blurry.status).toBe(200);
    expect(blurry.json.photo.status).toBe("rejected");
    expect(blurry.json.photo.quality?.issues[0]).toMatchObject({ code: "blurry", severity: "error" });
    const dup = await upload(model.id, selfie("alice-02"));
    expect(dup.json.photo.quality?.issues[0]?.code).toBe("duplicate");
    expect(dup.json.readiness).toMatchObject({ total: 5, accepted: 3, rejected: 2 });

    const rows = await db.select().from(trainingPhotos).where(eq(trainingPhotos.modelId, model.id));
    expect(rows).toHaveLength(5);
  });

  it("strips EXIF metadata before storing", async () => {
    const model = await createModel();
    await consent(model.id);
    const withExif = await sharp(selfie("alice-05"))
      .withExif({ IFD0: { Copyright: "secret-location", Artist: "phone" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const res = await upload(model.id, new Uint8Array(withExif));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(trainingPhotos).where(eq(trainingPhotos.id, res.json.photo.id));
    const stored = await getStorage().get(row!.storageKey);
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(Buffer.from(stored).includes("secret-location")).toBe(false);
  });

  it("caps the training set and validates uploads", async () => {
    const model = await createModel();
    await consent(model.id);
    expect((await callRoute(photosRoute, { url: `/api/models/${model.id}/photos`, params: { id: model.id }, body: imageForm("file", new Uint8Array(Buffer.from("not an image at all"))) })).status).toBe(400);

    await db.insert(trainingPhotos).values(
      Array.from({ length: 30 }, (_, i) => ({
        modelId: model.id,
        userId: u.id,
        storageKey: storageKeys.trainingPhoto(u.id, model.id, `tph_fake${i}`),
        width: 1024,
        height: 1280,
        status: "accepted" as const,
      })),
    );
    const res = await upload(model.id, selfie("alice-06"));
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/30 good photos/);
  });

  it("deletes a photo with its stored files", async () => {
    const model = await createModel();
    await consent(model.id);
    const { json } = await upload(model.id, selfie("alice-02"));
    const [row] = await db.select().from(trainingPhotos).where(eq(trainingPhotos.id, json.photo.id));
    const res = await callRoute(deletePhotoRoute, {
      url: `/api/models/${model.id}/photos/${json.photo.id}`,
      method: "DELETE",
      params: { id: model.id, photoId: json.photo.id },
    });
    expect(res.status).toBe(200);
    expect(res.json.readiness.total).toBe(0);
    expect(await db.select().from(trainingPhotos).where(eq(trainingPhotos.id, json.photo.id))).toEqual([]);
    expect(await getStorage().exists(row!.storageKey)).toBe(false);
    expect(await getStorage().exists(row!.thumbKey!)).toBe(false);
  });
});

describe("authorization (no IDOR)", () => {
  it("answers 404 for every route on another user's model", async () => {
    const owner = await createTestUser({ credits: 100 });
    const theirs = await createTestModel(owner.id, { status: "collecting" });
    const [photo] = await db
      .insert(trainingPhotos)
      .values({ modelId: theirs.id, userId: owner.id, storageKey: "users/x/p.jpg", width: 1, height: 1, status: "accepted" })
      .returning();
    const id = theirs.id;
    const calls = [
      callRoute(getModelRoute, { url: `/api/models/${id}`, params: { id } }),
      callRoute(patchModelRoute, { url: `/api/models/${id}`, method: "PATCH", params: { id }, body: { name: "mine now" } }),
      callRoute(deleteModelRoute, { url: `/api/models/${id}`, method: "DELETE", params: { id } }),
      callRoute(challengeRoute, { url: `/api/models/${id}/consent/challenge`, method: "POST", params: { id } }),
      postConsent(id, "alice-01", "token"),
      upload(id, selfie("alice-02")),
      callRoute(deletePhotoRoute, { url: `/api/models/${id}/photos/${photo!.id}`, method: "DELETE", params: { id, photoId: photo!.id } }),
      callRoute(trainRoute, { url: `/api/models/${id}/train`, params: { id }, body: { mode: "trained" } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe("not_found");
    }
    const [still] = await db.select().from(identityModels).where(and(eq(identityModels.id, id), eq(identityModels.userId, owner.id)));
    expect(still).toMatchObject({ name: theirs.name, status: "collecting" });
    expect(await db.select().from(trainingPhotos).where(eq(trainingPhotos.modelId, id))).toHaveLength(1);
  });

  it("requires a session", async () => {
    sessionMock.setUser(null);
    expect((await callRoute(listModelsRoute, { url: "/api/models" })).status).toBe(401);
    expect((await callRoute(createModelRoute, { url: "/api/models", body: { name: "x", subject: "man" } })).status).toBe(401);
  });
});
