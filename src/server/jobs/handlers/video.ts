/**
 * Photo -> video handler: animates one of the user's own generated photos into a 5 s / 10 s clip.
 * Completion uses the engine's default ingestion (ingestVideos: output safety check, first-frame
 * thumbnail, duration probe); `plan.sourceMediaId` becomes the video's `parentMediaId`.
 */
import { DEFAULT_MOTION_PROMPT } from "@/components/video/video-options";
import type { MediaRow } from "@/db/types";
import { getVideoProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { getOwnedMedia, providerInputUrl } from "@/server/media/service";
import type { AspectRatio } from "@/types/domain";
import { defineHandler } from "./types";

/** Persisted on jobs.output.plan (JSON). `prompt` is also the default-ingestion media prompt. */
export type VideoPlanData = {
  prompt: string;
  durationSec: 5 | 10;
  aspectRatio?: AspectRatio;
  sourceKey: string;
  sourceMime: string;
};

/**
 * Load a photo the user owns to animate. Only OpenShoot-generated media qualify (uploads never do),
 * and only still images (DECISIONS #11).
 */
export async function getVideoSourcePhoto(userId: string, mediaId: string): Promise<MediaRow> {
  const source = await getOwnedMedia(userId, mediaId);
  if (source.kind !== "image") throw errors.validation("Pick a photo to animate — videos can't be used as a source.");
  return source;
}

export default defineHandler({
  type: "video",

  async plan({ user, input }) {
    const source = await getVideoSourcePhoto(user.id, input.sourceMediaId);
    const userPrompt = input.prompt?.trim() ?? "";
    const data: VideoPlanData = {
      prompt: userPrompt || DEFAULT_MOTION_PROMPT,
      durationSec: input.durationSec,
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
      sourceKey: source.storageKey,
      sourceMime: source.mimeType,
    };
    return {
      modelId: source.modelId,
      sourceMediaId: source.id,
      textsToModerate: userPrompt ? [userPrompt] : [],
      data,
    };
  },

  async submit({ plan, submitOpts }) {
    const data = plan.data as VideoPlanData;
    const imageUrl = await providerInputUrl(data.sourceKey, data.sourceMime);
    return getVideoProvider().submitImageToVideo(
      { imageUrl, prompt: data.prompt, durationSec: data.durationSec, aspectRatio: data.aspectRatio },
      submitOpts,
    );
  },
});
