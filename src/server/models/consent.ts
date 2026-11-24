/**
 * Live consent selfie. The selfie must come from the in-app camera: the client first asks for a
 * capture challenge (random, single-use, 5-minute token whose sha256 is kept in the model's
 * metadata) and sends it with the photo. This doesn't prove liveness on its own, but it stops
 * scripted uploads of arbitrary files and records how consent was given. The selfie is then
 * verified by the safety module (exactly one adult face, not sexual, not a public figure) and its
 * face embedding becomes the identity every training photo must match.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { consentRecords, identityModels, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newId, newToken } from "@/lib/ids";
import { AppError, errors } from "@/server/http";
import { normalizeImage } from "@/server/images/process";
import { verifyConsentSelfie } from "@/server/safety";
import { getStorage, storageKeys } from "@/server/storage";
import type { ModelStatus } from "@/types/domain";
import { getOwnedModel } from "./service";

export const CONSENT_CHALLENGE_TTL_SEC = 5 * 60;
/** Statuses in which a (new) consent selfie may be taken. */
const CONSENT_STATUSES: ModelStatus[] = ["awaiting_consent", "collecting"];
const SELFIE_MAX_SIDE = 1600;

interface StoredChallenge {
  hash: string;
  expiresAt: string;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function readChallenge(model: IdentityModelRow): StoredChallenge | null {
  const raw = model.metadata?.consentChallenge;
  if (!raw || typeof raw !== "object") return null;
  const { hash, expiresAt } = raw as Partial<StoredChallenge>;
  return typeof hash === "string" && typeof expiresAt === "string" ? { hash, expiresAt } : null;
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

/** Issue a single-use capture token for the camera (replaces any earlier one). */
export async function createConsentChallenge(
  userId: string,
  modelId: string,
): Promise<{ captureToken: string; expiresAt: string }> {
  const model = await getOwnedModel(userId, modelId);
  await assertConsentAllowed(model);
  const captureToken = newToken();
  const challenge: StoredChallenge = {
    hash: sha256(captureToken),
    expiresAt: new Date(Date.now() + CONSENT_CHALLENGE_TTL_SEC * 1000).toISOString(),
  };
  await db
    .update(identityModels)
    .set({
      metadata: sql`coalesce(${identityModels.metadata}, '{}'::jsonb) || jsonb_build_object('consentChallenge', ${JSON.stringify(challenge)}::jsonb)`,
    })
    .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, userId)));
  return { captureToken, expiresAt: challenge.expiresAt };
}

const captureExpired = () =>
  new AppError("consent_required", "This camera capture expired. Take the selfie again with the camera.");

/**
 * Validate + consume a capture token. Single use: the stored challenge is removed by a conditional
 * update keyed on its hash, so two concurrent submissions can't both use it.
 */
export async function consumeConsentChallenge(model: IdentityModelRow, captureToken: string): Promise<void> {
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
}

export interface SubmitConsentInput {
  user: UserRow;
  modelId: string;
  /** Raw selfie bytes from the camera capture (normalized here). */
  selfie: Uint8Array;
  captureToken: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Verify a live consent selfie and attach it (+ its face embedding) to the model. */
export async function submitConsentSelfie(input: SubmitConsentInput): Promise<IdentityModelRow> {
  const { user } = input;
  const model = await getOwnedModel(user.id, input.modelId);
  await assertConsentAllowed(model);
  await consumeConsentChallenge(model, input.captureToken);

  const normalized = await normalizeImage(input.selfie, { maxSide: SELFIE_MAX_SIDE });
  const verified = await verifyConsentSelfie(normalized.bytes, { userId: user.id, modelId: model.id });

  const recordId = newId("cns");
  const key = storageKeys.consentSelfie(user.id, model.id, recordId);
  const storage = getStorage();
  await storage.put(key, normalized.bytes, { contentType: normalized.mimeType });

  let updated: IdentityModelRow | undefined;
  try {
    updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(identityModels)
        .set({
          consentSelfieKey: key,
          consentEmbedding: verified.embedding,
          consentVerifiedAt: new Date(),
          status: "collecting",
        })
        .where(
          and(
            eq(identityModels.id, model.id),
            eq(identityModels.userId, user.id),
            inArray(identityModels.status, CONSENT_STATUSES),
            // Re-check under the update: photos uploaded meanwhile would no longer match a new selfie.
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
          captureMethod: "camera",
          faceConfidence: verified.face.primary?.confidence ?? null,
          age: verified.age,
          faces: verified.face.count,
          selfieSha256: createHash("sha256").update(normalized.bytes).digest("hex"),
          storageKey: key,
          width: normalized.width,
          height: normalized.height,
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
