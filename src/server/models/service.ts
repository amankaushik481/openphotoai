/**
 * Identity model helpers shared by many workstreams. CONTRACT FILE (owner: models workstream).
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, trainingPhotos, user as userTable } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import type { IdentityRef } from "@/providers/types";
import { errors } from "@/server/http";
import { providerInputUrl } from "@/server/media/service";
import { signedUrl } from "@/server/storage";
import type { IdentityModelDTO } from "@/types/domain";

/** Reference photos sent with instant-mode (reference-based) identities. */
export const INSTANT_REFERENCE_PHOTOS = 4;

export type IdentityMode = "instant" | "trained";

/** `metadata.mode` of a model ("trained" when unset). */
export function identityModeOf(model: Pick<IdentityModelRow, "metadata">): IdentityMode {
  return model.metadata?.mode === "instant" ? "instant" : "trained";
}

/** Load a model owned by the user (not deleted). Throws AppError not_found. */
export async function getOwnedModel(userId: string, modelId: string): Promise<IdentityModelRow> {
  const [row] = await db
    .select()
    .from(identityModels)
    .where(and(eq(identityModels.id, modelId), eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
    .limit(1);
  if (!row) throw errors.notFound("Model");
  return row;
}

/** Provider identity reference for a READY model (includes a few reference photo URLs). */
export async function identityRefFor(model: IdentityModelRow, opts?: { referencePhotos?: number }): Promise<IdentityRef> {
  if (model.status !== "ready") throw errors.conflict(`"${model.name}" isn't ready yet.`);
  const instant = identityModeOf(model) === "instant";
  if (!instant && !model.providerModelRef) throw errors.conflict(`"${model.name}" has no trained weights yet.`);

  // Instant models are reference-based (no weights); trained models only need photos on request
  // (e.g. multi-person scenes), since uploading them on every generation is wasteful.
  const wanted = opts?.referencePhotos ?? (instant ? INSTANT_REFERENCE_PHOTOS : 0);
  let referenceImageUrls: string[] | undefined;
  if (wanted > 0) {
    const photos = await db
      .select({ storageKey: trainingPhotos.storageKey })
      .from(trainingPhotos)
      .where(
        and(
          eq(trainingPhotos.modelId, model.id),
          eq(trainingPhotos.userId, model.userId),
          eq(trainingPhotos.status, "accepted"),
        ),
      )
      .orderBy(sql`${trainingPhotos.faceMatchScore} desc nulls last`, asc(trainingPhotos.createdAt))
      .limit(wanted);
    if (instant && photos.length === 0) throw errors.conflict(`"${model.name}" has no accepted photos.`);
    referenceImageUrls = await Promise.all(photos.map((p) => providerInputUrl(p.storageKey, "image/jpeg")));
  }

  return {
    modelRef: instant ? "" : model.providerModelRef!,
    triggerWord: model.triggerWord,
    subject: model.subject,
    ...(referenceImageUrls ? { referenceImageUrls } : {}),
  };
}

export async function toModelDTO(model: IdentityModelRow, viewerUserId: string): Promise<IdentityModelDTO> {
  const shared = model.userId !== viewerUserId;
  const [counts, owner, coverUrl] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${trainingPhotos.status} = 'accepted')::int`,
      })
      .from(trainingPhotos)
      .where(and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId))),
    shared
      ? db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, model.userId)).limit(1)
      : Promise.resolve([]),
    model.coverMediaKey ? signedUrl(model.coverMediaKey) : Promise.resolve(null),
  ]);
  return {
    id: model.id,
    name: model.name,
    subject: model.subject,
    status: model.status,
    triggerWord: model.triggerWord,
    coverUrl,
    photoCount: Number(counts[0]?.total ?? 0),
    acceptedPhotoCount: Number(counts[0]?.accepted ?? 0),
    consentVerified: model.consentVerifiedAt !== null,
    trainingJobId: model.trainingJobId,
    shared,
    ...(shared ? { ownerName: owner[0]?.name ?? null } : {}),
    createdAt: model.createdAt.toISOString(),
    trainedAt: model.trainedAt?.toISOString() ?? null,
  };
}

/** Real deletion: storage prefix + provider-side model + rows; sends confirmation email. */
export async function deleteModelCompletely(userId: string, modelId: string): Promise<void> {
  void userId;
  void modelId;
  throw new Error("not implemented: deleteModelCompletely (models)");
}
