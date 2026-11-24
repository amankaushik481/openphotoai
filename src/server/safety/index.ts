/**
 * Safety module. CONTRACT FILE (owner: safety workstream).
 *
 * Non-negotiable rules (cannot be disabled by env — see docs/SAFETY.md):
 *  1. Consent: every training photo must face-match the live consent selfie.
 *  2. Adults only: training refused if any face is estimated under 18 (+ margin).
 *  3. No sexual content: prompt filter + output classifier on every image/video; blocked
 *     outputs are never stored or shown.
 *  4. Public figures: prompts and reference images targeting public figures are blocked.
 *  5. Multi-person: every identity must be owned by the user or shared via an accepted invite.
 * Every block is recorded in moderation_events.
 */
import type { IdentityModelRow } from "@/db/types";
import type { FaceAnalysisSummary, ModerationEventKind, ModerationSnapshot, PhotoQualityReport } from "@/types/domain";

export interface SafetyContext {
  userId: string;
  jobId?: string;
  modelId?: string;
}

/** Record a safety decision in moderation_events. */
export async function recordModerationEvent(
  kind: ModerationEventKind,
  ctx: SafetyContext,
  details: Record<string, unknown>,
): Promise<void> {
  void kind;
  void ctx;
  void details;
  throw new Error("not implemented: recordModerationEvent (safety)");
}

/**
 * Check user-provided text (prompts, edit instructions, scripts). Throws
 * AppError("content_blocked") with a human message when blocked (sexual content,
 * minors, public figures, hateful/violent content), after recording an event.
 */
export async function assertTextAllowed(texts: string[], ctx: SafetyContext): Promise<void> {
  void texts;
  void ctx;
  throw new Error("not implemented: assertTextAllowed (safety)");
}

/** Classify a generated image. Blocked outputs must be discarded by the caller. */
export async function checkOutputImage(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  void bytes;
  void ctx;
  throw new Error("not implemented: checkOutputImage (safety)");
}

/** Classify a generated video by sampling frames. Fails closed. */
export async function checkOutputVideo(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  void bytes;
  void ctx;
  throw new Error("not implemented: checkOutputVideo (safety)");
}

/**
 * Check an uploaded reference/garment image: sexual content, minors, public figures.
 * Throws AppError("content_blocked") when not allowed.
 */
export async function assertReferenceImageAllowed(
  bytes: Uint8Array,
  ctx: SafetyContext & { purpose: "reference" | "garment" | "mask" },
): Promise<{ face: FaceAnalysisSummary; moderation: ModerationSnapshot }> {
  void bytes;
  void ctx;
  throw new Error("not implemented: assertReferenceImageAllowed (safety)");
}

/**
 * Verify a live consent selfie: exactly one face, adult, not sexual. Returns the
 * embedding to store on the identity model. Throws AppError("consent_required"|"content_blocked").
 */
export async function verifyConsentSelfie(
  bytes: Uint8Array,
  ctx: SafetyContext,
): Promise<{ embedding: number[]; face: FaceAnalysisSummary; age: number | null }> {
  void bytes;
  void ctx;
  throw new Error("not implemented: verifyConsentSelfie (safety)");
}

/**
 * Safety analysis of a training photo against the consent embedding. Returns issues to merge
 * into the quality report: face_mismatch / underage / nsfw / no_face / multiple_faces (all "error").
 */
export async function analyzeTrainingPhotoSafety(
  bytes: Uint8Array,
  consentEmbedding: number[],
  ctx: SafetyContext,
): Promise<{
  face: FaceAnalysisSummary;
  faceMatchScore: number | null;
  ageEstimate: number | null;
  issues: PhotoQualityReport["issues"];
}> {
  void bytes;
  void consentEmbedding;
  void ctx;
  throw new Error("not implemented: analyzeTrainingPhotoSafety (safety)");
}

/**
 * Final gate before training: re-verifies all accepted photos match consent and are adults.
 * Throws AppError("content_blocked"/"consent_required").
 */
export async function assertTrainingAllowed(model: IdentityModelRow, ctx: SafetyContext): Promise<void> {
  void model;
  void ctx;
  throw new Error("not implemented: assertTrainingAllowed (safety)");
}

/**
 * Resolve identity models a user may use. Each model must be status "ready" and either owned
 * by the user or shared with them through an accepted model_shares invite. Throws
 * AppError("forbidden") + records "multi_person_unauthorized" otherwise.
 */
export async function assertModelsUsable(userId: string, modelIds: string[]): Promise<IdentityModelRow[]> {
  void userId;
  void modelIds;
  throw new Error("not implemented: assertModelsUsable (safety)");
}

/** 0..1 likeness of the main face in `bytes` to an identity embedding (null if no face). */
export async function likenessScore(bytes: Uint8Array, embedding: number[]): Promise<number | null> {
  void bytes;
  void embedding;
  throw new Error("not implemented: likenessScore (safety)");
}
