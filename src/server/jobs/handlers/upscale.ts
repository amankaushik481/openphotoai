/**
 * Upscale handler (2× / 4×, optional face restore) plus the plumbing shared by every enhancement
 * handler (upscale, face_restore, remove_background). Handler files are one per job type, so the
 * shared parts live here and face-restore.ts / remove-background.ts import them.
 *
 * An enhancement turns one OpenShoot photo owned by the user into exactly one new photo:
 *  - there is no user text, so nothing to moderate (the output is still safety-checked on ingest);
 *  - the output links to its source (parentMediaId) and keeps the source's prompt, model and pack
 *    for context;
 *  - it is never hidden by the best-shots picker (the user asked for this exact photo);
 *  - likeness is scored only when the source itself passed the likeness guarantee, so the guarantee
 *    refunds identity damage done by the enhancement, not photos that already didn't look like you;
 *  - transparency survives (ingestion stores images with real alpha as PNG).
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  ALREADY_TRANSPARENT_MESSAGE,
  isTransparentImage,
  sizeOf,
  upscaleBlock,
  upscaleBlockMessage,
  UPSCALE_MAX_RESULT_LONG_SIDE,
  UPSCALE_MAX_SOURCE_LONG_SIDE,
  VIDEO_NOT_SUPPORTED_MESSAGE,
  type ImageSize,
} from "@/components/enhance/enhance-rules";
import { db } from "@/db";
import { media } from "@/db/schema";
import type { IdentityModelRow, MediaRow, UserRow } from "@/db/types";
import { getImageProvider } from "@/providers/registry";
import { AppError, errors } from "@/server/http";
import { imageMetrics } from "@/server/images/process";
import { LIKENESS_GUARANTEE_THRESHOLD } from "@/server/media/scoring";
import { getOwnedMedia, ingestImages, providerInputUrl } from "@/server/media/service";
import { getOwnedModel } from "@/server/models/service";
import { getStorage } from "@/server/storage";
import { defineHandler, type CompleteArgs, type CompleteResult, type JobPlan } from "./types";

export const ENHANCE_KINDS = ["upscale", "face_restore", "remove_background"] as const;
export type EnhanceKind = (typeof ENHANCE_KINDS)[number];

const enhancePlanSchema = z.object({
  kind: z.enum(ENHANCE_KINDS),
  sourceMediaId: z.string().min(1),
  sourceKey: z.string().min(1),
  sourceMime: z.string().min(1),
  sourceWidth: z.number().int().nullable(),
  sourceHeight: z.number().int().nullable(),
  sourceIsDraft: z.boolean(),
  /** Source prompt, stored on the output for context (never sent to the provider). */
  sourcePrompt: z.string().nullable(),
  sourceSeed: z.number().int().nullable(),
  scoreLikeness: z.boolean(),
});

/** Persisted on jobs.output.plan for enhancement jobs. */
export type EnhancePlanData = z.infer<typeof enhancePlanSchema>;

export function readEnhancePlan(data: unknown): EnhancePlanData {
  const parsed = enhancePlanSchema.safeParse(data);
  if (!parsed.success) throw new Error(`invalid enhancement plan: ${parsed.error.message}`);
  return parsed.data;
}

/** The source's identity model when it still belongs to the user (null if deleted / not theirs). */
async function linkedModel(userId: string, modelId: string | null): Promise<IdentityModelRow | null> {
  if (!modelId) return null;
  try {
    const model = await getOwnedModel(userId, modelId);
    return model.status === "deleting" ? null : model;
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") return null;
    throw err;
  }
}

/** Authorize the source photo of an enhancement and build the plan shared by all enhancement types. */
export async function planEnhancement(
  user: UserRow,
  sourceMediaId: string,
  kind: EnhanceKind,
): Promise<{ source: MediaRow; plan: JobPlan & { data: EnhancePlanData } }> {
  const source = await getOwnedMedia(user.id, sourceMediaId);
  if (source.kind !== "image") throw errors.validation(VIDEO_NOT_SUPPORTED_MESSAGE);
  const model = await linkedModel(user.id, source.modelId);
  const sourceLikeness = source.scores?.likeness;
  const scoreLikeness =
    kind !== "remove_background" &&
    model !== null &&
    sourceLikeness !== undefined &&
    sourceLikeness >= LIKENESS_GUARANTEE_THRESHOLD;

  const data: EnhancePlanData = {
    kind,
    sourceMediaId: source.id,
    sourceKey: source.storageKey,
    sourceMime: source.mimeType,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceIsDraft: source.isDraft,
    sourcePrompt: source.prompt,
    sourceSeed: source.seed,
    scoreLikeness,
  };
  return {
    source,
    plan: { modelId: model?.id ?? null, packId: source.packId, sourceMediaId: source.id, textsToModerate: [], data },
  };
}

/** Provider-fetchable URL of the enhancement's source photo. */
export async function enhanceSourceUrl(plan: JobPlan): Promise<string> {
  const data = readEnhancePlan(plan.data);
  return providerInputUrl(data.sourceKey, data.sourceMime);
}

/**
 * Store the single enhanced image: default ingestion (safety check, scores, AI label, watermark,
 * thumbnail), then make sure it is linked to its source and visible.
 */
export async function completeEnhancement({ job, output, plan }: CompleteArgs): Promise<CompleteResult> {
  const data = readEnhancePlan(plan);
  const image = output.images?.[0];
  // Throwing lets the engine retry the completion and, if it keeps happening, fail + refund the job.
  if (!image) throw new Error(`${job.type} job ${job.id}: the provider returned no image`);

  const { mediaIds, blockedCount } = await ingestImages(job, [{ ...image, seed: undefined }], {
    prompt: data.sourcePrompt ?? undefined,
    seed: data.sourceSeed ?? undefined,
    scoreLikeness: data.scoreLikeness,
    isDraft: false,
  });
  if (mediaIds.length) {
    // A low-likeness result is still refunded by ingestion, but the user asked for this photo: show it.
    await db
      .update(media)
      .set({ hidden: false, parentMediaId: data.sourceMediaId })
      .where(and(eq(media.userId, job.userId), inArray(media.id, mediaIds)));
  }
  return { mediaIds, blockedCount, extra: { sourceMediaId: data.sourceMediaId } };
}

/** Refuse background removal on a photo that is already transparent. */
export function assertNotTransparent(source: Pick<MediaRow, "mimeType">): void {
  if (isTransparentImage(source.mimeType)) throw errors.validation(ALREADY_TRANSPARENT_MESSAGE);
}

/** Pixel size of the source (probed from storage when the row has no dimensions). */
async function sourceSize(source: MediaRow): Promise<ImageSize> {
  const known = sizeOf(source);
  if (known) return known;
  const metrics = await imageMetrics(await getStorage().get(source.storageKey));
  return { width: metrics.width, height: metrics.height };
}

export default defineHandler({
  type: "upscale",

  async plan({ user, input }) {
    const { source, plan } = await planEnhancement(user, input.sourceMediaId, "upscale");
    const size = await sourceSize(source);
    const block = upscaleBlock(size, input.scale);
    if (block) {
      throw errors.validation(upscaleBlockMessage(block, size, input.scale), {
        reason: block,
        width: size.width,
        height: size.height,
        maxSourceLongSide: UPSCALE_MAX_SOURCE_LONG_SIDE,
        maxResultLongSide: UPSCALE_MAX_RESULT_LONG_SIDE,
      });
    }
    return { ...plan, data: { ...plan.data, sourceWidth: size.width, sourceHeight: size.height } };
  },

  async submit({ input, plan, submitOpts }) {
    const imageUrl = await enhanceSourceUrl(plan);
    return getImageProvider().submitUpscale({ imageUrl, scale: input.scale, faceRestore: input.faceRestore }, submitOpts);
  },

  complete: completeEnhancement,
});
