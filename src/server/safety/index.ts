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
 *
 * Every check fails closed: a provider error is treated as "blocked", never as "allowed".
 * Implementation map:
 *   text.ts (+ text-filter.ts, normalize.ts, terms.ts, public-figures.ts)  assertTextAllowed
 *   outputs.ts      checkOutputImage, checkOutputVideo
 *   reference.ts    assertReferenceImageAllowed
 *   consent.ts      verifyConsentSelfie
 *   liveness.ts     pickLivenessChallenge, verifyLiveness (active head-pose liveness for the consent selfie)
 *   training.ts     analyzeTrainingPhotoSafety, assertTrainingAllowed
 *   multi-person.ts assertModelsUsable
 *   likeness.ts     likenessScore (embeddings.ts: cosine / l2normalize / mean)
 *   events.ts       recordModerationEvent
 *   policy.ts       thresholds (hard floors), category mapping, user-facing messages
 */
export type { SafetyContext } from "./context";

/** Record a safety decision in moderation_events. */
export { recordModerationEvent } from "./events";

/**
 * Check user-provided text (prompts, edit instructions, scripts). Throws
 * AppError("content_blocked") with a human message when blocked (sexual content,
 * minors, public figures, hateful/violent content), after recording an event.
 */
export { assertTextAllowed } from "./text";

/** Classify a generated image / video (sampled frames). Blocked outputs must be discarded by the caller. Fail closed. */
export { checkOutputImage, checkOutputVideo } from "./outputs";

/**
 * Check an uploaded reference/garment image: sexual content, minors, public figures.
 * Throws AppError("content_blocked") when not allowed.
 */
export { assertReferenceImageAllowed } from "./reference";

/**
 * Verify a live consent selfie: exactly one face, adult, not sexual. Returns the
 * embedding to store on the identity model. Throws AppError("consent_required"|"content_blocked").
 */
export { verifyConsentSelfie } from "./consent";

/**
 * analyzeTrainingPhotoSafety: issues to merge into the quality report (face_mismatch / underage /
 * nsfw / no_face / multiple_faces, all "error"). assertTrainingAllowed: final gate before training.
 */
export { analyzeTrainingPhotoSafety, assertTrainingAllowed } from "./training";

/**
 * Resolve identity models a user may use (owned, or shared through an accepted model_shares invite).
 * Throws AppError("forbidden") + records "multi_person_unauthorized" otherwise.
 */
export { assertModelsUsable } from "./multi-person";

/** 0..1 likeness of the main face in `bytes` to an identity embedding (null if no face). */
export { likenessScore } from "./likeness";

export { classifyText, classifyTexts, type TextCategory, type TextFilterResult } from "./text-filter";
export { cosineSimilarity, l2normalize, meanEmbedding } from "./embeddings";
export { SAFETY_POLICY } from "./policy";
