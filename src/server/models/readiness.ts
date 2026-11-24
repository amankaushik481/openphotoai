/**
 * Training-set readiness: counts, head-pose variety, blockers (training disabled) and tips.
 * Pure (`computeReadiness`) plus a loader for a model's photos (`getModelReadiness`).
 */
import { and, eq } from "drizzle-orm";
import { TRAINING } from "@/config/app";
import { db } from "@/db";
import { trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, TrainingPhotoRow } from "@/db/types";
import { SAFETY_POLICY } from "@/server/safety";
import type { PhotoQualityReport, ReadinessDTO } from "@/types/domain";
import { identityModeOf, type IdentityMode } from "./service";

export type PoseBucket = keyof ReadinessDTO["variety"];

/** |yaw| below this (and |pitch| below FRONTAL_MAX_PITCH) counts as facing the camera. */
export const FRONTAL_MAX_YAW = 15;
export const FRONTAL_MAX_PITCH = 12;
/** For the best likeness a trained model wants this many varied photos. */
export const RECOMMENDED_TRAINED_PHOTOS = 15;

/** Accepted photos wanted per pose bucket (tips only, never blockers). */
export const VARIETY_TARGETS: Record<IdentityMode, ReadinessDTO["variety"]> = {
  trained: { frontal: 4, left: 2, right: 2, up: 1, down: 1 },
  instant: { frontal: 2, left: 0, right: 0, up: 0, down: 0 },
};

const BUCKET_PHRASE: Record<PoseBucket, [one: string, many: string]> = {
  frontal: ["photo facing the camera", "photos facing the camera"],
  left: ["photo turned to the left", "photos turned to the left"],
  right: ["photo turned to the right", "photos turned to the right"],
  up: ["photo looking slightly up", "photos looking slightly up"],
  down: ["photo looking slightly down", "photos looking slightly down"],
};
const BUCKET_ORDER: PoseBucket[] = ["frontal", "left", "right", "up", "down"];

export type ReadinessPhoto = Pick<TrainingPhotoRow, "status" | "quality">;

export function minPhotosFor(mode: IdentityMode): number {
  return SAFETY_POLICY.minPhotos[mode];
}

/** Head-pose bucket (yaw: negative = left; pitch: positive = up). Null when the pose is unknown. */
export function poseBucket(yaw: number | undefined, pitch: number | undefined): PoseBucket | null {
  if (!Number.isFinite(yaw) && !Number.isFinite(pitch)) return null;
  const y = Number.isFinite(yaw) ? (yaw as number) : 0;
  const p = Number.isFinite(pitch) ? (pitch as number) : 0;
  if (Math.abs(y) < FRONTAL_MAX_YAW && Math.abs(p) < FRONTAL_MAX_PITCH) return "frontal";
  // Whichever angle is further outside its frontal range decides the bucket.
  if (Math.abs(y) / FRONTAL_MAX_YAW >= Math.abs(p) / FRONTAL_MAX_PITCH) return y < 0 ? "left" : "right";
  return p > 0 ? "up" : "down";
}

function poseOf(quality: PhotoQualityReport | null): PoseBucket | null {
  return quality ? poseBucket(quality.metrics.yaw, quality.metrics.pitch) : null;
}

function plural(n: number, [one, many]: [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function computeReadiness(
  photos: readonly ReadinessPhoto[],
  opts: { mode: IdentityMode; consentVerified: boolean },
): ReadinessDTO {
  const accepted = photos.filter((p) => p.status === "accepted");
  const rejected = photos.filter((p) => p.status === "rejected").length;
  const minRequired = minPhotosFor(opts.mode);
  const maxAllowed = TRAINING.maxPhotos;

  const variety: ReadinessDTO["variety"] = { frontal: 0, left: 0, right: 0, up: 0, down: 0 };
  let withPose = 0;
  for (const photo of accepted) {
    const bucket = poseOf(photo.quality);
    if (!bucket) continue;
    variety[bucket] += 1;
    withPose += 1;
  }

  const blockers: string[] = [];
  if (!opts.consentVerified) blockers.push("Take your live consent selfie first.");
  if (accepted.length < minRequired) {
    const missing = minRequired - accepted.length;
    blockers.push(
      `Add ${missing} more good ${missing === 1 ? "photo" : "photos"}: you have ${accepted.length} of the ${minRequired} needed.`,
    );
  }
  if (accepted.length > maxAllowed) {
    const extra = accepted.length - maxAllowed;
    blockers.push(`Remove ${extra} ${extra === 1 ? "photo" : "photos"}: a model can use up to ${maxAllowed}.`);
  }

  const tips: string[] = [];
  if (rejected > 0) {
    tips.push(
      `${rejected} ${rejected === 1 ? "photo can't" : "photos can't"} be used. Tap ${rejected === 1 ? "it" : "them"} to see how to fix the problem, then remove or replace ${rejected === 1 ? "it" : "them"}.`,
    );
  }
  // Pose tips only when the face provider reports head pose.
  if (withPose > 0) {
    const targets = VARIETY_TARGETS[opts.mode];
    for (const bucket of BUCKET_ORDER) {
      const missing = targets[bucket] - variety[bucket];
      if (missing > 0) tips.push(`Add ${plural(missing, BUCKET_PHRASE[bucket])}.`);
    }
  }
  const withWarnings = accepted.filter((p) => p.quality?.issues.some((i) => i.severity === "warning")).length;
  if (withWarnings > 0) {
    tips.push(
      `${withWarnings} ${withWarnings === 1 ? "photo has" : "photos have"} minor issues. ${withWarnings === 1 ? "It" : "They"}'ll still work, but replacing ${withWarnings === 1 ? "it" : "them"} can improve the likeness.`,
    );
  }
  if (opts.mode === "trained" && accepted.length < RECOMMENDED_TRAINED_PHOTOS) {
    tips.push(
      `For the best likeness, use ${RECOMMENDED_TRAINED_PHOTOS}-20 photos with different outfits, backgrounds, expressions and lighting.`,
    );
  }

  return {
    total: photos.length,
    accepted: accepted.length,
    rejected,
    minRequired,
    maxAllowed,
    variety,
    canTrain: blockers.length === 0,
    blockers,
    tips,
  };
}

/** Readiness for both modes from one photo list (the wizard lets the user pick a mode). */
export function computeReadinessByMode(
  photos: readonly ReadinessPhoto[],
  consentVerified: boolean,
): Record<IdentityMode, ReadinessDTO> {
  return {
    instant: computeReadiness(photos, { mode: "instant", consentVerified }),
    trained: computeReadiness(photos, { mode: "trained", consentVerified }),
  };
}

export async function loadReadinessPhotos(model: Pick<IdentityModelRow, "id" | "userId">): Promise<ReadinessPhoto[]> {
  return db
    .select({ status: trainingPhotos.status, quality: trainingPhotos.quality })
    .from(trainingPhotos)
    .where(and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId)));
}

/** Readiness of a model's current training set for `mode` (default: the model's own mode). */
export async function getModelReadiness(model: IdentityModelRow, mode?: IdentityMode): Promise<ReadinessDTO> {
  const photos = await loadReadinessPhotos(model);
  return computeReadiness(photos, { mode: mode ?? identityModeOf(model), consentVerified: model.consentVerifiedAt !== null });
}
