/**
 * Train handler (Trained mode): zip the accepted, EXIF-stripped training photos, hand them to the
 * training provider (FLUX LoRA), and on completion store the provider model reference.
 *
 *   plan      owned model in collecting/failed, final safety gate (consent match + adults only),
 *             trainingsPerDay rate limit
 *   submit    claims the model (status training) → zip → storage → provider URL → submitTraining
 *   complete  model ready + "model ready" email (weights of a model deleted meanwhile are removed)
 *   onFailed  model back to collecting (credits are refunded by the engine) + "training failed" email
 * The training zip is deleted once the job ends either way (privacy).
 */
import { zipSync } from "fflate";
import { and, eq, inArray } from "drizzle-orm";
import { APP, TRAINING } from "@/config/app";
import { db } from "@/db";
import { identityModels, jobs, user as userTable } from "@/db/schema";
import type { IdentityModelRow, JobRow } from "@/db/types";
import { getAIProvider, getTrainingProvider } from "@/providers/registry";
import type { TrainingProvider } from "@/providers/types";
import type { AIProviderName } from "@/types/domain";
import { errors } from "@/server/http";
import { providerInputUrl } from "@/server/media/service";
import { bestAcceptedPhotos, coverKeyFor } from "@/server/models/photos";
import { minPhotosFor } from "@/server/models/readiness";
import { getOwnedModel } from "@/server/models/service";
import { copyWeightsToStorage, setWeightsSql, shouldCopyWeights } from "@/server/models/weights";
import {
  assertTrainable,
  setModeSql,
  trainingSetSummary,
  TRAINABLE_STATUSES,
  withMode,
} from "@/server/models/training";
import { rateLimit } from "@/server/rate-limit";
import { assertTrainingAllowed } from "@/server/safety";
import { getStorage, storageKeys } from "@/server/storage";
import { defineHandler } from "./types";

/** Persisted on jobs.output.plan. */
export type TrainPlanData = {
  triggerWord: string;
  subject: string;
};

function modelUrl(modelId: string): string {
  return `${APP.url}/app/models/${modelId}`;
}

async function deleteTrainingZip(job: JobRow): Promise<void> {
  if (!job.modelId) return; // model deleted: its whole storage prefix is gone already
  await getStorage()
    .delete(storageKeys.trainingZip(job.userId, job.modelId, job.id))
    .catch((err: unknown) => console.warn(`[train] couldn't delete training zip of ${job.id}:`, err));
}

type ModelEmail = { template: "model_ready" } | { template: "training_failed"; reason: string };

/** Email the model's owner (never throws; templates are loaded lazily, most jobs never need them). */
async function notifyOwner(job: JobRow, model: { id: string; name: string }, email: ModelEmail): Promise<void> {
  const [owner] = await db
    .select({ email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, job.userId))
    .limit(1);
  if (!owner?.email) return;
  const { sendEmailSafe } = await import("@/server/email");
  const base = { name: owner.name, modelName: model.name, url: modelUrl(model.id) };
  if (email.template === "model_ready") {
    await sendEmailSafe("model_ready", owner.email, base, { userId: job.userId });
  } else {
    await sendEmailSafe("training_failed", owner.email, { ...base, reason: email.reason }, { userId: job.userId });
  }
}

/** Weights trained for a model that no longer wants them (deleted meanwhile): remove them. */
async function discardWeights(provider: AIProviderName | null, modelRef: string, jobId: string): Promise<void> {
  if (!provider) return;
  try {
    const p = getAIProvider(provider) as Partial<TrainingProvider>;
    await p.deleteModel?.(modelRef);
  } catch (err) {
    console.error(`[train] couldn't delete orphaned weights of ${jobId}:`, err);
  }
}

export default defineHandler({
  type: "train",

  async plan({ user, input }) {
    const model = await getOwnedModel(user.id, input.modelId);
    assertTrainable(model);
    await assertTrainingAllowed(withMode(model, "trained"), { userId: user.id, modelId: model.id });
    await rateLimit("trainingsPerDay", `user:${user.id}`);
    const data: TrainPlanData = { triggerWord: model.triggerWord, subject: model.subject };
    return { modelId: model.id, textsToModerate: [], data };
  },

  async submit({ user, job, input, submitOpts }) {
    const current = await getOwnedModel(user.id, input.modelId);
    const qualitySummary = await trainingSetSummary(current, "trained");
    // Claim the model for this job; a concurrent second train request loses here (and is refunded).
    const [model] = await db
      .update(identityModels)
      .set({ status: "training", trainingJobId: job.id, metadata: setModeSql("trained"), qualitySummary })
      .where(
        and(
          eq(identityModels.id, current.id),
          eq(identityModels.userId, user.id),
          inArray(identityModels.status, TRAINABLE_STATUSES),
        ),
      )
      .returning();
    if (!model) throw errors.conflict("This model is already training.");

    const photos = await bestAcceptedPhotos(model, TRAINING.maxPhotos);
    if (photos.length < minPhotosFor("trained")) {
      throw errors.validation(`You need at least ${minPhotosFor("trained")} accepted photos to train a model.`);
    }
    const storage = getStorage();
    const files: Record<string, Uint8Array> = {};
    for (const [i, photo] of photos.entries()) {
      files[`${String(i + 1).padStart(2, "0")}.jpg`] = await storage.get(photo.storageKey);
    }
    // JPEGs don't compress further: store only.
    const zip = zipSync(files, { level: 0 });
    const zipKey = storageKeys.trainingZip(user.id, model.id, job.id);
    await storage.put(zipKey, zip, { contentType: "application/zip" });
    const imagesZipUrl = await providerInputUrl(zipKey, "application/zip");

    return getTrainingProvider().submitTraining(
      { imagesZipUrl, imageCount: photos.length, triggerWord: model.triggerWord, subject: model.subject },
      submitOpts,
    );
  },

  async complete({ job, output }) {
    const modelRef = output.modelRef?.trim();
    // Thrown errors are retried by the engine and then fail the job (with a refund).
    if (!modelRef) throw new Error("The training provider returned no model reference.");

    // Providers that can't delete files (fal): keep our own copy of the weights under the model's
    // storage prefix, so deleting the model really deletes them (SAF-7). A failed copy throws (retried).
    // Each completion attempt writes its own copy (see weightsKey).
    const weights =
      job.modelId && shouldCopyWeights(job.provider, modelRef)
        ? await copyWeightsToStorage({ userId: job.userId, modelId: job.modelId, jobId: job.id, modelRef, attempt: job.attempts })
        : null;
    const dropOwnCopy = async () => {
      if (weights) await getStorage().delete(weights.key).catch(() => undefined);
    };
    let coverMediaKey: string | null = null;
    try {
      if (job.modelId) coverMediaKey = await coverKeyFor({ id: job.modelId, userId: job.userId });
    } catch (err) {
      await dropOwnCopy();
      throw err;
    }

    // The model turns ready in the same transaction that marks the job succeeded (engine `commit`):
    // a cancel, or another attempt taking over, can then never leave a ready model on a canceled,
    // refunded job, and an attempt that lost can't touch the model the winner made ready.
    let ready: IdentityModelRow | undefined;
    return {
      mediaIds: [],
      blockedCount: 0,
      extra: { modelRef },
      async commit(tx) {
        if (!job.modelId) return;
        [ready] = await tx
          .update(identityModels)
          .set({
            status: "ready",
            provider: job.provider,
            providerModelRef: modelRef,
            trainedAt: new Date(),
            coverMediaKey,
            ...(weights ? { metadata: setWeightsSql(weights) } : {}),
          })
          .where(
            and(
              eq(identityModels.id, job.modelId),
              eq(identityModels.userId, job.userId),
              eq(identityModels.trainingJobId, job.id),
              eq(identityModels.status, "training"),
            ),
          )
          .returning();
      },
      async afterCommit() {
        if (ready) {
          await notifyOwner(job, ready, { template: "model_ready" });
        } else {
          // The model was deleted (or is being deleted) meanwhile: nothing will use these weights.
          await discardWeights(job.provider, modelRef, job.id);
          await dropOwnCopy();
        }
        await deleteTrainingZip(job);
      },
      async discard() {
        await dropOwnCopy();
        // The provider's copy is shared by every attempt: remove it only once the job can't succeed
        // anymore (canceled / failed). While another attempt holds the lease, or after it succeeded,
        // that attempt owns it.
        const [current] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, job.id)).limit(1);
        if (!current || (current.status !== "running" && current.status !== "succeeded")) {
          await discardWeights(job.provider, modelRef, job.id);
        }
      },
    };
  },

  async onFailed({ job, error }) {
    await deleteTrainingZip(job);
    if (!job.modelId) return;
    // Only the job that owns the training slot resets the model (not a losing concurrent request,
    // and not a model that is being deleted).
    const [model] = await db
      .update(identityModels)
      .set({ status: "collecting" })
      .where(
        and(
          eq(identityModels.id, job.modelId),
          eq(identityModels.userId, job.userId),
          eq(identityModels.trainingJobId, job.id),
          eq(identityModels.status, "training"),
        ),
      )
      .returning();
    // A canceled training (by the user, or by deleting the model) needs no email.
    if (model && job.status === "failed") await notifyOwner(job, model, { template: "training_failed", reason: error });
  },
});
