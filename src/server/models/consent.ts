/**
 * Live consent selfie with ACTIVE LIVENESS. The client first asks for a capture challenge: a random,
 * single-use, 5-minute token (only its sha256 is kept in the model's metadata) bound to a random
 * sequence of head-pose steps ("turn left", "look up"...). The in-app camera captures one frame per
 * step plus the frontal selfie and posts them together with the token. The frontal selfie is verified
 * by the safety module (exactly one adult face, not sexual, not a public figure) and the frames by the
 * liveness check (same person, distinct frames, head pose moved as asked: src/server/safety/liveness.ts).
 * The frontal embedding becomes the identity every training photo must match.
 *
 * This is active liveness, not certified presentation-attack detection (see docs/SAFETY.md §2).
 *
 * Consent can only be (re)taken while the model has no photos. Both this path and the photo upload
 * path lock the model row, so a photo scored against an older consent can never be stored after a
 * new consent selfie (the consent timestamp is the consent version).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { consentRecords, identityModels, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newId, newToken } from "@/lib/ids";
import { AppError, errors } from "@/server/http";
import { isLivenessStep, type LivenessStep } from "@/lib/liveness";
import { normalizeImage } from "@/server/images/process";
import { verifyConsentSelfie } from "@/server/safety";
import { pickLivenessChallenge, verifyLiveness } from "@/server/safety/liveness";
import { getStorage, storageKeys } from "@/server/storage";
import type { ModelStatus } from "@/types/domain";
import { getOwnedModel } from "./service";

export const CONSENT_CHALLENGE_TTL_SEC = 5 * 60;
/** Statuses in which a (new) consent selfie may be taken. */
const CONSENT_STATUSES: ModelStatus[] = ["awaiting_consent", "collecting"];
const SELFIE_MAX_SIDE = 1600;
/** Recorded in consent_records.evidence.captureMethod. */
export const CONSENT_CAPTURE_METHOD = "camera+active-liveness";

interface StoredChallenge {
  hash: string;
  expiresAt: string;
  /** Head-pose steps the frames must show, in order. */
  steps: LivenessStep[];
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function readChallenge(model: IdentityModelRow): StoredChallenge | null {
  const raw = model.metadata?.consentChallenge;
  if (!raw || typeof raw !== "object") return null;
  const { hash, expiresAt, steps } = raw as Partial<StoredChallenge>;
  if (typeof hash !== "string" || typeof expiresAt !== "string") return null;
  // A challenge without liveness steps (issued before liveness existed) is not usable.
  if (!Array.isArray(steps) || steps.length === 0 || !steps.every(isLivenessStep)) return null;
  return { hash, expiresAt, steps };
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Consent can be (re)taken before training, and only while no training photo exists. */
async function assertConsentAllowed(model: IdentityModelRow): Promise<void> {
  if (!CONSENT_STATUSES.includes(model.status)) {
    throw errors.conflict("The consent selfie can't be changed after training has started.");
  }
  const photos = await db.$count(trainingPhotos, and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId)));
  if (photos > 0) {
    throw errors.conflict("Remove all photos from this model before retaking the consent selfie.");
  }
}

/** Issue a single-use capture token + random liveness steps for the camera (replaces any earlier one). */
export async function createConsentChallenge(
  userId: string,
  modelId: string,
): Promise<{ captureToken: string; expiresAt: string; steps: LivenessStep[] }> {
  const model = await getOwnedModel(userId, modelId);
  await assertConsentAllowed(model);
  const captureToken = newToken();
  const challenge: StoredChallenge = {
    hash: sha256(captureToken),
    expiresAt: new Date(Date.now() + CONSENT_CHALLENGE_TTL_SEC * 1000).toISOString(),
    steps: pickLivenessChallenge(),
  };
  await db
    .update(identityModels)
    .set({
      metadata: sql`coalesce(${identityModels.metadata}, '{}'::jsonb) || jsonb_build_object('consentChallenge', ${JSON.stringify(challenge)}::jsonb)`,
    })
    .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, userId)));
  return { captureToken, expiresAt: challenge.expiresAt, steps: challenge.steps };
}

const captureExpired = () =>
  new AppError("consent_required", "This camera capture expired. Take the selfie again with the camera.");

/**
 * Validate + consume a capture token; returns the liveness steps it was issued with. Single use: the
 * stored challenge is removed by a conditional update keyed on its hash, so two concurrent
 * submissions can't both use it (and a failed liveness check needs a new challenge with new steps).
 */
export async function consumeConsentChallenge(model: IdentityModelRow, captureToken: string): Promise<LivenessStep[]> {
  const stored = readChallenge(model);
  const hash = sha256(captureToken);
  if (!captureToken || !stored || !sameHash(stored.hash, hash)) {
    throw new AppError("consent_required", "The consent selfie must be taken live with the camera in the app.");
  }
  if (!(Date.parse(stored.expiresAt) > Date.now())) throw captureExpired();
  const consumed = await db
    .update(identityModels)
    .set({ metadata: sql`${identityModels.metadata} - 'consentChallenge'` })
    .where(
      and(
        eq(identityModels.id, model.id),
        eq(identityModels.userId, model.userId),
        sql`${identityModels.metadata} -> 'consentChallenge' ->> 'hash' = ${hash}`,
      ),
    )
    .returning({ id: identityModels.id });
  if (consumed.length === 0) throw captureExpired();
  return stored.steps;
}

export interface SubmitConsentInput {
  user: UserRow;
  modelId: string;
  /** Raw frontal selfie bytes from the camera capture (normalized here). */
  selfie: Uint8Array;
  /** One camera frame per liveness step of the challenge, in order. */
  livenessFrames: readonly Uint8Array[];
  captureToken: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Raw forwarded headers behind `ipAddress` (evidence; see forwardedChain() in src/server/http.ts). */
  forwarded?: { xForwardedFor: string | null; xRealIp: string | null } | null;
}

async function normalizeFrame(bytes: Uint8Array) {
  return normalizeImage(bytes, { maxSide: SELFIE_MAX_SIDE }).catch(() => {
    throw errors.validation("We couldn't read one of the camera frames. Please take the selfie again.");
  });
}

/** Verify a live consent selfie (+ liveness frames) and attach it (+ its face embedding) to the model. */
export async function submitConsentSelfie(input: SubmitConsentInput): Promise<IdentityModelRow> {
  const { user } = input;
  const ctx = { userId: user.id, modelId: input.modelId };
  const model = await getOwnedModel(user.id, input.modelId);
  await assertConsentAllowed(model);
  const steps = await consumeConsentChallenge(model, input.captureToken);

  const normalized = await normalizeFrame(input.selfie);
  const frames = await Promise.all(input.livenessFrames.map(normalizeFrame));
  const verified = await verifyConsentSelfie(normalized.bytes, ctx);
  const liveness = await verifyLiveness(
    { bytes: normalized.bytes, embedding: verified.embedding, yaw: verified.face.primary?.yaw, pitch: verified.face.primary?.pitch },
    frames.map((f) => f.bytes),
    steps,
    ctx,
  );

  const recordId = newId("cns");
  const key = storageKeys.consentSelfie(user.id, model.id, recordId);
  const storage = getStorage();
  await storage.put(key, normalized.bytes, { contentType: normalized.mimeType });

  let updated: IdentityModelRow | undefined;
  try {
    updated = await db.transaction(async (tx) => {
      // Lock the model row first (the photo upload path takes the same lock), then re-check with a
      // fresh statement: a photo committed meanwhile is visible here, so it can't slip in.
      const [locked] = await tx
        .select({ id: identityModels.id, status: identityModels.status })
        .from(identityModels)
        .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, user.id)))
        .for("update");
      if (!locked || !CONSENT_STATUSES.includes(locked.status)) return undefined;
      const photos = await tx.$count(trainingPhotos, eq(trainingPhotos.modelId, model.id));
      if (photos > 0) throw errors.conflict("Remove all photos from this model before retaking the consent selfie.");
      const [row] = await tx
        .update(identityModels)
        .set({
          consentSelfieKey: key,
          consentEmbedding: verified.embedding,
          // Database clock: photos stored after this consent always have a later created_at.
          consentVerifiedAt: sql`now()`,
          status: "collecting",
        })
        .where(
          and(
            eq(identityModels.id, model.id),
            eq(identityModels.userId, user.id),
            inArray(identityModels.status, CONSENT_STATUSES),
            sql`not exists (select 1 from ${trainingPhotos} where ${trainingPhotos.modelId} = ${model.id})`,
          ),
        )
        .returning();
      if (!row) return undefined;
      await tx.insert(consentRecords).values({
        id: recordId,
        userId: user.id,
        modelId: model.id,
        kind: "training_selfie",
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        evidence: {
          captureMethod: CONSENT_CAPTURE_METHOD,
          liveness,
          faceConfidence: verified.face.primary?.confidence ?? null,
          age: verified.age,
          faces: verified.face.count,
          selfieSha256: createHash("sha256").update(normalized.bytes).digest("hex"),
          storageKey: key,
          width: normalized.width,
          height: normalized.height,
          ...(input.forwarded ? { forwarded: input.forwarded } : {}),
        },
      });
      return row;
    });
  } catch (err) {
    await storage.delete(key).catch(() => undefined);
    throw err;
  }
  if (!updated) {
    await storage.delete(key).catch(() => undefined);
    throw errors.conflict("This model changed while we checked your selfie. Refresh and try again.");
  }

  // A retaken selfie replaces the previous one; keep only the current capture.
  if (model.consentSelfieKey && model.consentSelfieKey !== key) {
    await storage.delete(model.consentSelfieKey).catch(() => undefined);
  }
  return updated;
}
