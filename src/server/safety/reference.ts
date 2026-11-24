/** Uploaded reference / garment / mask images: sexual content, minors, public figures. Fails closed. */
import type { DetectedFace } from "@/providers/types";
import { AppError, errors } from "@/server/http";
import type { FaceAnalysisSummary, ModerationSnapshot } from "@/types/domain";
import type { SafetyContext } from "./context";
import { errorMessage, hashBytes, recordBlock } from "./events";
import { facesUnder, summarizeFaces } from "./faces";
import { canonicalCategory, imageBlockedMessage, SAFETY_POLICY } from "./policy";
import { analyzeFaces, detectPublicFigure, moderateImage, snapshot } from "./providers";

type ReferenceContext = SafetyContext & { purpose: "reference" | "garment" | "mask" };

/**
 * Check an uploaded reference/garment image: sexual content, minors, public figures.
 * Masks are only classified (they carry no faces). Throws AppError("content_blocked") when not allowed.
 */
export async function assertReferenceImageAllowed(
  bytes: Uint8Array,
  ctx: ReferenceContext,
): Promise<{ face: FaceAnalysisSummary; moderation: ModerationSnapshot }> {
  const base = { purpose: ctx.purpose, sha256: hashBytes(bytes), bytes: bytes.byteLength };

  const moderation = await guard(ctx, base, "classifier", async () => {
    const c = await moderateImage(bytes);
    if (c.blocked) {
      await recordBlock("reference_blocked", ctx, { ...base, provider: c.providerName, categories: c.categories });
      throw blocked(c.categories);
    }
    return snapshot(c);
  });
  if (ctx.purpose === "mask") return { face: { count: 0 }, moderation };

  const faces: DetectedFace[] = await guard(ctx, base, "faces", async () => (await analyzeFaces(bytes)).faces);
  const minors = facesUnder(faces, SAFETY_POLICY.minReferenceAge);
  if (minors.length > 0) {
    await recordBlock("underage", ctx, { ...base, ages: minors.map((f) => f.age), minAge: SAFETY_POLICY.minReferenceAge });
    throw blocked(["minors"]);
  }

  if (faces.length > 0) {
    const figure = await guard(ctx, base, "public_figure", () => detectPublicFigure(bytes));
    if (figure?.isPublicFigure) {
      await recordBlock("public_figure", ctx, { ...base, name: figure.name ?? null, confidence: figure.confidence ?? null });
      throw blocked(["public_figure"]);
    }
  }
  return { face: summarizeFaces(faces), moderation };
}

function blocked(categories: readonly string[]): AppError {
  return errors.contentBlocked(imageBlockedMessage(categories), {
    categories: [...new Set(categories.map(canonicalCategory))],
  });
}

/** Run a provider step; any unexpected error is recorded and turned into a block (fail closed). */
async function guard<T>(
  ctx: SafetyContext,
  base: Record<string, unknown>,
  stage: "classifier" | "faces" | "public_figure",
  step: () => Promise<T>,
): Promise<T> {
  try {
    return await step();
  } catch (err) {
    if (err instanceof AppError) throw err;
    await recordBlock("reference_blocked", ctx, {
      ...base,
      stage,
      categories: ["moderation_error"],
      error: errorMessage(err),
    });
    throw blocked(["moderation_error"]);
  }
}
