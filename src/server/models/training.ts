/**
 * Starting a model: Instant (reference-based, free, ready immediately) or Trained (LoRA training
 * job through the job engine, 40 credits). The train job handler lives in
 * src/server/jobs/handlers/train.ts and uses the helpers exported here.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { identityModels } from "@/db/schema";
import type { IdentityModelRow, JobRow, UserRow } from "@/db/types";
import { errors } from "@/server/http";
import { assertTrainingAllowed } from "@/server/safety";
import type { ModelStatus } from "@/types/domain";
import { coverKeyFor } from "./photos";
import { computeReadiness, loadReadinessPhotos } from "./readiness";
import { getOwnedModel, type IdentityMode } from "./service";

export const trainModelBody = z.object({ mode: z.enum(["instant", "trained"]) });

/** Statuses from which a model can be started (failed = a previous training failed). */
export const TRAINABLE_STATUSES: ModelStatus[] = ["collecting", "failed"];

export function assertTrainable(model: IdentityModelRow): void {
  if (TRAINABLE_STATUSES.includes(model.status)) return;
  switch (model.status) {
    case "awaiting_consent":
      throw errors.validation("Take your live consent selfie and add photos first.");
    case "training":
      throw errors.conflict("This model is already training.");
    case "ready":
      throw errors.conflict("This model is already ready.");
    default:
      throw errors.conflict("This model is being deleted.");
  }
}

/** A copy of the model with `metadata.mode` set (the safety gate reads the mode's photo minimum). */
export function withMode(model: IdentityModelRow, mode: IdentityMode): IdentityModelRow {
  return { ...model, metadata: { ...(model.metadata ?? {}), mode } };
}

/** jsonb patch setting `metadata.mode` without clobbering other metadata keys. */
export function setModeSql(mode: IdentityMode) {
  return sql`coalesce(${identityModels.metadata}, '{}'::jsonb) || jsonb_build_object('mode', ${mode}::text)`;
}

/** Aggregate of the training set stored on identity_models.quality_summary when a model starts. */
export async function trainingSetSummary(model: IdentityModelRow, mode: IdentityMode): Promise<Record<string, unknown>> {
  const photos = await loadReadinessPhotos(model);
  const readiness = computeReadiness(photos, { mode, consentVerified: model.consentVerifiedAt !== null });
  const scores = photos.filter((p) => p.status === "accepted").map((p) => p.quality?.score ?? 0);
  return {
    mode,
    accepted: readiness.accepted,
    variety: readiness.variety,
    averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    computedAt: new Date().toISOString(),
  };
}

/** Instant mode: no training, no credits. Re-runs the safety gate, then the model is ready. */
export async function activateInstantModel(user: UserRow, model: IdentityModelRow): Promise<IdentityModelRow> {
  assertTrainable(model);
  await assertTrainingAllowed(withMode(model, "instant"), { userId: user.id, modelId: model.id });
  const [qualitySummary, coverMediaKey] = await Promise.all([trainingSetSummary(model, "instant"), coverKeyFor(model)]);
  const [row] = await db
    .update(identityModels)
    .set({
      status: "ready",
      metadata: setModeSql("instant"),
      provider: null,
      providerModelRef: null,
      coverMediaKey,
      qualitySummary,
      trainedAt: new Date(),
    })
    .where(
      and(eq(identityModels.id, model.id), eq(identityModels.userId, user.id), inArray(identityModels.status, TRAINABLE_STATUSES)),
    )
    .returning();
  if (!row) throw errors.conflict("This model changed in the meantime. Refresh and try again.");
  return row;
}

/**
 * POST /api/models/:id/train. Instant → `{ model, job: null }`; Trained → a "train" job created by
 * the engine (credits debited, refunded automatically on failure) → `{ model, job }`.
 */
export async function startTraining(
  user: UserRow,
  modelId: string,
  mode: IdentityMode,
): Promise<{ model: IdentityModelRow; job: JobRow | null }> {
  const model = await getOwnedModel(user.id, modelId);
  assertTrainable(model);
  if (mode === "instant") return { model: await activateInstantModel(user, model), job: null };

  // Lazy: the engine imports the handler registry, whose train handler imports this module.
  const { createJob } = await import("@/server/jobs/engine");
  const job = await createJob(user, { type: "train", modelId: model.id });
  return { model: await getOwnedModel(user.id, model.id), job };
}
