/**
 * Training photos: upload (normalize → quality + safety analysis → store), list, delete.
 *
 * Privacy rule: a photo that fails a SAFETY check (doesn't match the consent selfie, possibly a
 * minor, sexual, no face / other people in it, or the check itself failed) is never stored; the
 * upload is answered with an error carrying the quality report. Photos that only fail technical
 * checks (blurry, dark, duplicate...) are kept as "rejected" so the user can see why and replace them.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRAINING } from "@/config/app";
import { db } from "@/db";
import { identityModels, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, TrainingPhotoRow, UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { AppError, errors } from "@/server/http";
import { makeThumbnail, normalizeImage } from "@/server/images/process";
import { getStorage, signedUrl, storageKeys } from "@/server/storage";
import type { ApiErrorCode, PhotoIssue, PhotoQualityReport, TrainingPhotoDTO } from "@/types/domain";
import { analyzeTrainingPhoto, SAFETY_ISSUE_CODES } from "./quality";
import { minPhotosFor } from "./readiness";
import { getOwnedModel, identityModeOf } from "./service";

/** Accepted + technically rejected photos kept per model (rejected ones can be removed to make room). */
export const MAX_STORED_PHOTOS = TRAINING.maxPhotos * 2;
const THUMB_SIDE = 384;

export async function toTrainingPhotoDTO(row: TrainingPhotoRow): Promise<TrainingPhotoDTO> {
  const [url, thumbUrl] = await Promise.all([
    signedUrl(row.storageKey),
    row.thumbKey ? signedUrl(row.thumbKey) : Promise.resolve<string | null>(null),
  ]);
  return {
    id: row.id,
    url,
    thumbUrl: thumbUrl ?? url,
    status: row.status,
    quality: row.quality,
    faceMatchScore: row.faceMatchScore,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTrainingPhotos(model: Pick<IdentityModelRow, "id" | "userId">): Promise<TrainingPhotoRow[]> {
  return db
    .select()
    .from(trainingPhotos)
    .where(and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId)))
    .orderBy(asc(trainingPhotos.createdAt), asc(trainingPhotos.id));
}

/** Accepted photos, best first (quality score, then face match). */
export async function bestAcceptedPhotos(
  model: Pick<IdentityModelRow, "id" | "userId">,
  limit: number = TRAINING.maxPhotos,
): Promise<TrainingPhotoRow[]> {
  return db
    .select()
    .from(trainingPhotos)
    .where(
      and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId), eq(trainingPhotos.status, "accepted")),
    )
    .orderBy(
      desc(sql`coalesce((${trainingPhotos.quality} ->> 'score')::int, 0)`),
      sql`${trainingPhotos.faceMatchScore} desc nulls last`,
      asc(trainingPhotos.createdAt),
    )
    .limit(limit);
}

/** Storage key for the model's cover image: thumbnail of the best accepted photo. */
export async function coverKeyFor(model: Pick<IdentityModelRow, "id" | "userId">): Promise<string | null> {
  const [best] = await bestAcceptedPhotos(model, 1);
  return best ? (best.thumbKey ?? best.storageKey) : null;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  return a !== null && b !== null && a.getTime() === b.getTime();
}

function uploadBlocked(model: IdentityModelRow): AppError | null {
  switch (model.status) {
    case "collecting":
    case "failed":
      return model.consentEmbedding ? null : new AppError("consent_required", "Take your live consent selfie first.");
    case "awaiting_consent":
      return new AppError("consent_required", "Take your live consent selfie before adding photos.");
    case "training":
      return errors.conflict("This model is training. You can add photos again if training fails.");
    case "ready":
      return errors.conflict("This model is ready. Create a new model to train with different photos.");
    case "deleting":
      return errors.conflict("This model is being deleted.");
  }
}

/** The error answering an upload that failed a safety check (the photo is not stored). */
function safetyRejection(issues: readonly PhotoIssue[], quality: PhotoQualityReport): AppError {
  const issue = issues.find((i) => i.severity === "error" && SAFETY_ISSUE_CODES.has(i.code))!;
  const code: ApiErrorCode =
    issue.code === "nsfw" || issue.code === "underage"
      ? "content_blocked"
      : issue.code === "face_mismatch"
        ? "consent_required"
        : "validation_error";
  return new AppError(code, `${issue.message} ${issue.fix}`, { issue: issue.code, quality, stored: false });
}

export interface AddTrainingPhotoResult {
  photo: TrainingPhotoRow;
  model: IdentityModelRow;
}

/** Analyze + store one training photo. Throws for safety rejections (nothing is stored). */
export async function addTrainingPhoto(user: UserRow, modelId: string, raw: Uint8Array): Promise<AddTrainingPhotoResult> {
  const model = await getOwnedModel(user.id, modelId);
  const blocked = uploadBlocked(model);
  if (blocked) throw blocked;

  const existing = await db
    .select({ status: trainingPhotos.status, phash: trainingPhotos.phash })
    .from(trainingPhotos)
    .where(and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, user.id)));
  const accepted = existing.filter((p) => p.status === "accepted").length;
  if (accepted >= TRAINING.maxPhotos) {
    throw errors.conflict(`You already have ${TRAINING.maxPhotos} good photos, the most a model can use.`);
  }
  if (existing.length >= MAX_STORED_PHOTOS) {
    throw errors.conflict("Remove some of the photos we can't use before adding more.");
  }

  // EXIF/GPS stripped, auto-rotated, re-encoded: nothing from the original file is kept.
  const normalized = await normalizeImage(raw);
  const analysis = await analyzeTrainingPhoto({
    bytes: normalized.bytes,
    consentEmbedding: model.consentEmbedding ?? [],
    existingPhashes: existing.map((p) => p.phash),
    consentSelfie: model.consentSelfieKey ? () => getStorage().get(model.consentSelfieKey!) : undefined,
    ctx: { userId: user.id, modelId: model.id },
  });
  if (analysis.safetyRejected) throw safetyRejection(analysis.quality.issues, analysis.quality);

  const id = newId("tph");
  const key = storageKeys.trainingPhoto(user.id, model.id, id);
  const thumbKey = storageKeys.trainingPhotoThumb(user.id, model.id, id);
  const storage = getStorage();
  const thumb = await makeThumbnail(normalized.bytes, THUMB_SIDE);
  await Promise.all([
    storage.put(key, normalized.bytes, { contentType: normalized.mimeType }),
    storage.put(thumbKey, thumb, { contentType: "image/webp" }),
  ]);

  try {
    const row = await db.transaction(async (tx) => {
      // Same row lock as the consent path: the photo was scored against `model.consentEmbedding`, so it
      // may only be stored while that consent is still the current one (the timestamp is its version).
      const [locked] = await tx
        .select({ status: identityModels.status, consentVerifiedAt: identityModels.consentVerifiedAt })
        .from(identityModels)
        .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, user.id)))
        .for("update");
      if (!locked || !sameInstant(locked.consentVerifiedAt, model.consentVerifiedAt)) {
        throw errors.conflict("Your consent selfie changed while this photo was being checked. Upload the photo again.");
      }
      const stillBlocked = uploadBlocked({ ...model, status: locked.status });
      if (stillBlocked) throw stillBlocked;
      // The limits again, under the lock: parallel uploads all passed the check before the (slow) analysis.
      const current = await tx
        .select({ status: trainingPhotos.status })
        .from(trainingPhotos)
        .where(and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, user.id)));
      if (current.filter((p) => p.status === "accepted").length >= TRAINING.maxPhotos) {
        throw errors.conflict(`You already have ${TRAINING.maxPhotos} good photos, the most a model can use.`);
      }
      if (current.length >= MAX_STORED_PHOTOS) {
        throw errors.conflict("Remove some of the photos we can't use before adding more.");
      }
      const [inserted] = await tx
        .insert(trainingPhotos)
        .values({
          id,
          modelId: model.id,
          userId: user.id,
          storageKey: key,
          thumbKey,
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes.byteLength,
          phash: analysis.phash,
          status: analysis.status,
          quality: analysis.quality,
          face: analysis.face,
          faceMatchScore: analysis.faceMatchScore,
          ageEstimate: analysis.ageEstimate,
        })
        .returning();
      return inserted!;
    });
    return { photo: row, model };
  } catch (err) {
    await Promise.allSettled([storage.delete(key), storage.delete(thumbKey)]);
    throw err;
  }
}

/**
 * Delete a training photo (row + stored files). Allowed any time except during deletion, so users
 * can always remove their selfies. An Instant model that drops below its minimum goes back to
 * collecting (it uses the photos as live references).
 */
export async function deleteTrainingPhoto(userId: string, modelId: string, photoId: string): Promise<IdentityModelRow> {
  const model = await getOwnedModel(userId, modelId);
  if (model.status === "deleting") throw errors.conflict("This model is being deleted.");
  const [photo] = await db
    .delete(trainingPhotos)
    .where(and(eq(trainingPhotos.id, photoId), eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, userId)))
    .returning();
  if (!photo) throw errors.notFound("Photo");
  const storage = getStorage();
  await Promise.allSettled([storage.delete(photo.storageKey), ...(photo.thumbKey ? [storage.delete(photo.thumbKey)] : [])]);

  const patch: Partial<typeof identityModels.$inferInsert> = {};
  if (model.coverMediaKey && (model.coverMediaKey === photo.storageKey || model.coverMediaKey === photo.thumbKey)) {
    patch.coverMediaKey = await coverKeyFor(model);
  }
  if (model.status === "ready" && identityModeOf(model) === "instant" && photo.status === "accepted") {
    const remaining = await db.$count(
      trainingPhotos,
      and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, userId), eq(trainingPhotos.status, "accepted")),
    );
    if (remaining < minPhotosFor("instant")) patch.status = "collecting";
  }
  if (Object.keys(patch).length === 0) return model;
  const [updated] = await db
    .update(identityModels)
    .set(patch)
    .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, userId)))
    .returning();
  return updated ?? model;
}
