/** Training-photo safety analysis and the final pre-training gate. */
import { and, eq } from "drizzle-orm";
import { APP } from "@/config/app";
import { db } from "@/db";
import { trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, TrainingPhotoRow } from "@/db/types";
import { AppError, errors } from "@/server/http";
import { getStorage } from "@/server/storage";
import type { FaceAnalysisSummary, PhotoIssue, PhotoQualityReport } from "@/types/domain";
import type { SafetyContext } from "./context";
import { cosineSimilarity, isValidEmbedding } from "./embeddings";
import { errorMessage, hashBytes, recordBlock } from "./events";
import { isFiniteNumber, largestFace, summarizeFaces } from "./faces";
import { PHOTO_ISSUES, SAFETY_POLICY, type IdentityMode } from "./policy";
import { analyzeFaces, faceMatchThreshold, moderateImage } from "./providers";

export interface TrainingPhotoSafety {
  face: FaceAnalysisSummary;
  /** Cosine similarity of the main face to the consent selfie (null when it can't be computed). */
  faceMatchScore: number | null;
  /** Lowest estimated age of any face in the photo (null when no face or any age is unknown). */
  ageEstimate: number | null;
  issues: PhotoQualityReport["issues"];
}

/**
 * Safety analysis of a training photo against the consent embedding. Returns issues to merge
 * into the quality report: face_mismatch / underage / nsfw / no_face / multiple_faces (all "error").
 * Provider failures produce an "unreadable" error issue (fail closed).
 */
export async function analyzeTrainingPhotoSafety(
  bytes: Uint8Array,
  consentEmbedding: number[],
  ctx: SafetyContext,
): Promise<TrainingPhotoSafety> {
  if (!isValidEmbedding(consentEmbedding)) {
    throw new AppError("consent_required", "Take your live consent selfie before uploading photos.");
  }
  const base = { purpose: "training_photo", sha256: hashBytes(bytes) };
  const issues: PhotoIssue[] = [];
  const addIssue = (issue: PhotoIssue) => {
    if (!issues.some((i) => i.code === issue.code)) issues.push({ ...issue });
  };

  const [mod, analysis] = await Promise.allSettled([moderateImage(bytes), analyzeFaces(bytes)]);
  if (mod.status === "rejected") {
    addIssue(PHOTO_ISSUES.check_failed);
    await recordBlock("reference_blocked", ctx, { ...base, categories: ["moderation_error"], error: errorMessage(mod.reason) });
  } else if (mod.value.blocked) {
    addIssue(PHOTO_ISSUES.nsfw);
    await recordBlock("reference_blocked", ctx, { ...base, provider: mod.value.providerName, categories: mod.value.categories });
  }

  if (analysis.status === "rejected") {
    addIssue(PHOTO_ISSUES.check_failed);
    await recordBlock("reference_blocked", ctx, { ...base, stage: "faces", categories: ["moderation_error"], error: errorMessage(analysis.reason) });
    return { face: { count: 0 }, faceMatchScore: null, ageEstimate: null, issues };
  }

  const { faces, matchThreshold } = analysis.value;
  const face = summarizeFaces(faces);
  const main = largestFace(faces);
  if (!main) {
    addIssue(PHOTO_ISSUES.no_face);
    return { face, faceMatchScore: null, ageEstimate: null, issues };
  }
  if (faces.length > 1) addIssue(PHOTO_ISSUES.multiple_faces);

  // Adults only: every face in the photo counts, not just the main one.
  const ages = faces.map((f) => f.age);
  const ageEstimate = ages.every(isFiniteNumber) ? Math.min(...ages) : null;
  if (ageEstimate !== null && ageEstimate < SAFETY_POLICY.minIdentityAge) {
    addIssue(PHOTO_ISSUES.underage);
    await recordBlock("underage", ctx, { ...base, stage: "training_photo", ages, minAge: SAFETY_POLICY.minIdentityAge });
  } else if (ageEstimate === null) {
    addIssue(PHOTO_ISSUES.age_unknown);
    await recordBlock("underage", ctx, { ...base, stage: "training_photo", reason: "age_unknown" });
  }

  const faceMatchScore = matchScore(consentEmbedding, main.embedding);
  if (faceMatchScore === null || faceMatchScore < matchThreshold) {
    addIssue(PHOTO_ISSUES.face_mismatch);
    await recordBlock("face_mismatch", ctx, { ...base, score: faceMatchScore, threshold: matchThreshold });
  }

  return { face, faceMatchScore, ageEstimate, issues };
}

/** Cosine similarity, or null when the embeddings can't be compared (e.g. provider changed). */
function matchScore(consent: number[], candidate: number[]): number | null {
  if (!isValidEmbedding(candidate)) return null;
  try {
    return cosineSimilarity(consent, candidate);
  } catch {
    return null;
  }
}

/**
 * Final gate before training: re-verifies all accepted photos match consent and are adults.
 * Throws AppError("content_blocked"/"consent_required").
 */
export async function assertTrainingAllowed(model: IdentityModelRow, ctx: SafetyContext): Promise<void> {
  const eventCtx: SafetyContext = { ...ctx, modelId: ctx.modelId ?? model.id };
  if (model.userId !== ctx.userId) throw errors.forbidden();
  if (model.deletedAt) throw errors.notFound("Model");

  const consentEmbedding = model.consentEmbedding;
  if (!isValidEmbedding(consentEmbedding) || !model.consentVerifiedAt) {
    await recordBlock("consent_failed", eventCtx, { stage: "pre_training", reason: "missing_consent" });
    throw new AppError("consent_required", "Take a live consent selfie before training this model.");
  }

  const mode: IdentityMode = model.metadata?.mode === "instant" ? "instant" : "trained";
  const photos = await db
    .select()
    .from(trainingPhotos)
    .where(
      and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.userId, model.userId), eq(trainingPhotos.status, "accepted")),
    );
  const minPhotos = SAFETY_POLICY.minPhotos[mode];
  if (photos.length < minPhotos) {
    throw errors.validation(`You need at least ${minPhotos} accepted photos for this model (you have ${photos.length}).`);
  }

  let threshold: number;
  try {
    threshold = await faceMatchThreshold();
  } catch (err) {
    await recordBlock("consent_failed", eventCtx, { stage: "pre_training", reason: "face_provider_error", error: errorMessage(err) });
    throw errors.contentBlocked("We couldn't verify your photos right now. Please try again in a moment.", {
      categories: ["moderation_error"],
    });
  }

  const underage: string[] = [];
  const mismatched: string[] = [];
  const nsfw: string[] = [];
  const unchecked: string[] = [];
  for (const photo of photos) {
    const v = await verifiedValues(photo, consentEmbedding, eventCtx);
    if (v.checkFailed) {
      unchecked.push(photo.id);
      continue;
    }
    if (v.nsfw) nsfw.push(photo.id);
    if (v.ageEstimate === null || v.ageEstimate < SAFETY_POLICY.minIdentityAge) underage.push(photo.id);
    if (v.faceMatchScore === null || v.faceMatchScore < threshold) mismatched.push(photo.id);
  }

  if (underage.length > 0) {
    await recordBlock("underage", eventCtx, { stage: "pre_training", photoIds: underage, minAge: SAFETY_POLICY.minIdentityAge });
    throw errors.contentBlocked(
      `${APP.name} is for adults only. Remove the photos that may show someone under 18 (or that we couldn't age-check) and try again.`,
      { categories: ["minors"], photoIds: underage },
    );
  }
  if (nsfw.length > 0) {
    throw errors.contentBlocked("Some photos were flagged by our safety check. Remove them and try again.", {
      categories: ["sexual"],
      photoIds: nsfw,
    });
  }
  if (unchecked.length > 0) {
    throw errors.contentBlocked("We couldn't re-check some of your photos right now. Please try again in a moment.", {
      categories: ["moderation_error"],
      photoIds: unchecked,
    });
  }
  if (mismatched.length > 0) {
    await recordBlock("face_mismatch", eventCtx, { stage: "pre_training", photoIds: mismatched, threshold });
    throw new AppError(
      "consent_required",
      "Some photos don't look like the person in your consent selfie. Remove them and try again — only upload photos of yourself.",
      { photoIds: mismatched },
    );
  }
}

/** Stored face-match/age values, re-analyzed from storage (and persisted) when missing. */
async function verifiedValues(
  photo: TrainingPhotoRow,
  consentEmbedding: number[],
  ctx: SafetyContext,
): Promise<{ faceMatchScore: number | null; ageEstimate: number | null; nsfw: boolean; checkFailed: boolean }> {
  if (photo.faceMatchScore !== null && photo.ageEstimate !== null) {
    return { faceMatchScore: photo.faceMatchScore, ageEstimate: photo.ageEstimate, nsfw: false, checkFailed: false };
  }
  let bytes: Uint8Array;
  try {
    bytes = await getStorage().get(photo.storageKey);
  } catch (err) {
    await recordBlock("consent_failed", ctx, { stage: "pre_training", reason: "photo_unavailable", photoId: photo.id, error: errorMessage(err) });
    throw errors.contentBlocked("We couldn't re-check one of your photos. Remove it, upload it again and retry.", {
      categories: ["moderation_error"],
      photoIds: [photo.id],
    });
  }
  const result = await analyzeTrainingPhotoSafety(bytes, consentEmbedding, ctx);
  const checkFailed = result.issues.some((i) => i.code === "unreadable");
  if (checkFailed) return { faceMatchScore: null, ageEstimate: null, nsfw: false, checkFailed };
  await db
    .update(trainingPhotos)
    .set({ faceMatchScore: result.faceMatchScore, ageEstimate: result.ageEstimate })
    .where(and(eq(trainingPhotos.id, photo.id), eq(trainingPhotos.userId, photo.userId)));
  return {
    faceMatchScore: result.faceMatchScore,
    ageEstimate: result.ageEstimate,
    nsfw: result.issues.some((i) => i.code === "nsfw"),
    checkFailed,
  };
}
