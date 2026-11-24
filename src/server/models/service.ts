/**
 * Identity model helpers shared by many workstreams. CONTRACT FILE (owner: models workstream).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, jobs, trainingPhotos, user as userTable } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import { getAIProvider } from "@/providers/registry";
import type { AsyncAIProvider, IdentityRef, TrainingProvider } from "@/providers/types";
import { errors } from "@/server/http";
import { providerInputUrl } from "@/server/media/service";
import { getStorage, signedUrl, storageKeys } from "@/server/storage";
import type { IdentityModelDTO } from "@/types/domain";
import type { IdentityMode, ModelView } from "./types";

/** Reference photos sent with instant-mode (reference-based) identities. */
export const INSTANT_REFERENCE_PHOTOS = 4;

export type { IdentityMode, ModelView } from "./types";

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

/** toModelDTO + the identity mode (additive field used by the /api/models routes and the UI). */
export async function toModelView(model: IdentityModelRow, viewerUserId: string): Promise<ModelView> {
  return { ...(await toModelDTO(model, viewerUserId)), mode: identityModeOf(model) };
}

export interface DeleteModelOptions {
  /** Send the "model deleted" confirmation email (default true; account deletion sends its own). */
  notify?: boolean;
}

export interface DeleteModelResult {
  /** False when the AI provider couldn't delete the trained weights (deletion continued anyway). */
  providerDeleted: boolean;
  providerError?: string;
  storageObjectsDeleted: number;
}

function canDeleteModels(provider: AsyncAIProvider): provider is AsyncAIProvider & Pick<TrainingProvider, "deleteModel"> {
  return typeof (provider as Partial<TrainingProvider>).deleteModel === "function";
}

/**
 * Real deletion: running training canceled, provider-side weights deleted (a failure is logged and
 * reported, never blocks the rest), every stored object under the model prefix (consent selfie,
 * training photos, zips) removed, then the row (cascades photos, consent records, shares; jobs and
 * media keep their rows with modelId = null). Sends a confirmation email.
 * Throws not_found for unknown / foreign models; a storage failure throws and leaves the model in
 * status "deleting" so the request can be retried.
 */
export async function deleteModelCompletely(
  userId: string,
  modelId: string,
  opts: DeleteModelOptions = {},
): Promise<DeleteModelResult> {
  const model = await getOwnedModel(userId, modelId);
  const owned = and(eq(identityModels.id, model.id), eq(identityModels.userId, userId));
  await db.update(identityModels).set({ status: "deleting" }).where(owned);

  // Stop training first so the provider can't finish (and store new weights) after deletion.
  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.modelId, model.id), eq(jobs.type, "train"), inArray(jobs.status, ["queued", "running"])));
  if (active.length > 0) {
    // Lazy import: the engine imports this module (getOwnedModel).
    const { cancelJob } = await import("@/server/jobs/engine");
    for (const job of active) {
      await cancelJob(userId, job.id).catch((err: unknown) =>
        console.error(`[models] couldn't cancel training job ${job.id} of ${model.id}:`, err),
      );
    }
  }

  let providerDeleted = true;
  let providerError: string | undefined;
  if (model.provider && model.providerModelRef) {
    try {
      const provider = getAIProvider(model.provider);
      if (!canDeleteModels(provider)) throw new Error(`provider "${model.provider}" can't delete trained models`);
      await provider.deleteModel(model.providerModelRef);
    } catch (err) {
      providerDeleted = false;
      providerError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      console.error(`[models] provider-side deletion failed for ${model.id} (${model.provider}): ${providerError}`);
    }
  }

  const storageObjectsDeleted = await getStorage().deletePrefix(storageKeys.modelPrefix(userId, model.id));
  await db.delete(identityModels).where(owned);

  if (opts.notify ?? true) {
    const [owner] = await db.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, userId)).limit(1);
    if (owner?.email) {
      // Lazy: email templates are heavy and most importers of this module never send mail.
      const { sendEmailSafe } = await import("@/server/email");
      await sendEmailSafe("model_deleted", owner.email, { modelName: model.name }, { userId });
    }
  }
  return { providerDeleted, ...(providerError ? { providerError } : {}), storageObjectsDeleted };
}
