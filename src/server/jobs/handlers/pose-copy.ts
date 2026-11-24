/**
 * Pose / style copy handler: put the user's identity into the pose, framing, setting and lighting of an uploaded
 * reference photo (uploads purpose "reference", already checked by assertReferenceImageAllowed at upload time).
 * The adapters wrap `prompt` in their own pose-copy template; reference photos of the identity are always sent,
 * since the reference-based edit model can't use a LoRA. Completion uses the default ingestion.
 */
import { getImageProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { getOwnedUpload, providerInputUrl } from "@/server/media/service";
import { getOwnedModel, identityRefFor } from "@/server/models/service";
import { expandPlaceholders } from "@/server/packs/registry";
import { ASPECT_RATIOS, type AspectRatio } from "@/types/domain";
import { defineHandler } from "./types";

/** Identity reference photos sent with a pose copy (the pose reference is image 1). */
export const POSE_IDENTITY_REFS = 4;
/** Direction used when the user adds no prompt of their own. */
export const DEFAULT_POSE_DIRECTION = "natural, relaxed expression; same pose, outfit style, setting and lighting as the reference";

/** Persisted on jobs.output.plan (JSON). */
export type PoseCopyPlanData = {
  /** Extra direction sent to the provider (also stored as the media prompt). */
  prompt: string;
  referenceKey: string;
  referenceMime: string;
  aspectRatio: AspectRatio;
  numImages: number;
  scoreLikeness: boolean;
};

/** The supported aspect ratio closest to `width`×`height` (log-ratio distance); "4:5" when unknown. */
export function closestAspectRatio(width: number | null | undefined, height: number | null | undefined): AspectRatio {
  if (!width || !height || width <= 0 || height <= 0) return "4:5";
  const target = Math.log(width / height);
  let best: AspectRatio = "4:5";
  let bestDiff = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number) as [number, number];
    const diff = Math.abs(Math.log(w / h) - target);
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return best;
}

export default defineHandler({
  type: "pose_copy",

  async plan({ user, input }) {
    const model = await getOwnedModel(user.id, input.modelId);
    if (model.status !== "ready") throw errors.conflict(`"${model.name}" isn't ready yet. Finish setting it up first.`);
    const reference = await getOwnedUpload(user.id, input.referenceUploadId, "reference");

    const userPrompt = input.prompt?.trim() ?? "";
    const data: PoseCopyPlanData = {
      prompt: userPrompt
        ? expandPlaceholders(userPrompt, { triggerWord: model.triggerWord, subject: model.subject })
        : DEFAULT_POSE_DIRECTION,
      referenceKey: reference.storageKey,
      referenceMime: reference.mimeType,
      aspectRatio: input.aspectRatio ?? closestAspectRatio(reference.width, reference.height),
      numImages: input.numImages,
      scoreLikeness: true,
    };
    return { modelId: model.id, textsToModerate: userPrompt ? [userPrompt] : [], data };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as PoseCopyPlanData;
    const model = await getOwnedModel(user.id, plan.modelId!);
    const [identity, referenceUrl] = await Promise.all([
      identityRefFor(model, { referencePhotos: POSE_IDENTITY_REFS }),
      providerInputUrl(data.referenceKey, data.referenceMime),
    ]);
    return getImageProvider().submitEdit(
      {
        mode: "pose_copy",
        prompt: data.prompt,
        imageUrls: [referenceUrl],
        identity,
        aspectRatio: data.aspectRatio,
        numImages: data.numImages,
      },
      submitOpts,
    );
  },
});
