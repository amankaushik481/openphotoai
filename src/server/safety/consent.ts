/** Live consent selfie verification: exactly one adult face, not sexual, not a public figure. */
import type { DetectedFace } from "@/providers/types";
import { AppError, errors } from "@/server/http";
import type { FaceAnalysisSummary } from "@/types/domain";
import type { SafetyContext } from "./context";
import { isValidEmbedding, l2normalize } from "./embeddings";
import { errorMessage, hashBytes, recordBlock } from "./events";
import { isFiniteNumber, summarizeFaces } from "./faces";
import { ADULTS_ONLY_MESSAGE, canonicalCategory, SAFETY_POLICY } from "./policy";
import { analyzeFaces, detectPublicFigure, moderateImage, type Classification } from "./providers";

const MESSAGES = {
  noFace: "We couldn't see your face. Face the camera in good light, remove sunglasses or masks, and try again.",
  multipleFaces: "Only you should be in the selfie. Make sure no one else is in the frame and try again.",
  ageUnknown: "We couldn't confirm your age from this selfie. Face the camera in good light and try again.",
  unreadable: "We couldn't read your face clearly. Face the camera in good light and try again.",
  nsfw: "This selfie was flagged by our safety check. Take a new selfie, fully clothed, with your face clearly visible.",
  publicFigure: "This selfie appears to show a public figure. The consent selfie must be a live photo of you.",
  checkFailed: "We couldn't check your selfie right now. Please try again in a moment.",
} as const;

/**
 * Verify a live consent selfie: exactly one face, adult, not sexual. Returns the
 * embedding to store on the identity model. Throws AppError("consent_required"|"content_blocked").
 */
export async function verifyConsentSelfie(
  bytes: Uint8Array,
  ctx: SafetyContext,
): Promise<{ embedding: number[]; face: FaceAnalysisSummary; age: number | null }> {
  const base = { sha256: hashBytes(bytes), bytes: bytes.byteLength };
  const fail = async (reason: string, error: AppError, extra: Record<string, unknown> = {}): Promise<never> => {
    await recordBlock("consent_failed", ctx, { ...base, reason, ...extra });
    throw error;
  };

  const [mod, analysis] = await Promise.allSettled([moderateImage(bytes), analyzeFaces(bytes)]);
  if (mod.status === "rejected") {
    return fail("moderation_error", checkFailed(), { error: errorMessage(mod.reason) });
  }
  const c: Classification = mod.value;
  if (c.blocked) {
    return fail("nsfw", errors.contentBlocked(MESSAGES.nsfw, { categories: canonical(c.categories) }), {
      provider: c.providerName,
      categories: c.categories,
    });
  }
  if (analysis.status === "rejected") {
    return fail("face_provider_error", checkFailed(), { error: errorMessage(analysis.reason) });
  }

  const faces: DetectedFace[] = analysis.value.faces;
  if (faces.length === 0) return fail("no_face", new AppError("consent_required", MESSAGES.noFace));
  if (faces.length > 1) {
    return fail("multiple_faces", new AppError("consent_required", MESSAGES.multipleFaces), { faces: faces.length });
  }

  const face = faces[0];
  if (!isFiniteNumber(face.age)) return fail("age_unknown", new AppError("consent_required", MESSAGES.ageUnknown));
  if (face.age < SAFETY_POLICY.minIdentityAge) {
    await recordBlock("underage", ctx, { ...base, stage: "consent", age: face.age, minAge: SAFETY_POLICY.minIdentityAge });
    throw errors.contentBlocked(ADULTS_ONLY_MESSAGE, { categories: ["minors"] });
  }
  if (!isValidEmbedding(face.embedding)) {
    return fail("invalid_embedding", new AppError("consent_required", MESSAGES.unreadable));
  }

  let figure: Awaited<ReturnType<typeof detectPublicFigure>>;
  try {
    figure = await detectPublicFigure(bytes);
  } catch (err) {
    return fail("moderation_error", checkFailed(), { stage: "public_figure", error: errorMessage(err) });
  }
  if (figure?.isPublicFigure) {
    await recordBlock("public_figure", ctx, { ...base, stage: "consent", name: figure.name ?? null });
    throw errors.contentBlocked(MESSAGES.publicFigure, { categories: ["public_figure"] });
  }

  return { embedding: l2normalize(face.embedding), face: summarizeFaces(faces), age: face.age };
}

function checkFailed(): AppError {
  return errors.contentBlocked(MESSAGES.checkFailed, { categories: ["moderation_error"] });
}

function canonical(categories: readonly string[]): string[] {
  return [...new Set(categories.map(canonicalCategory))];
}
