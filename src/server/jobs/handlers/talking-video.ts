/**
 * Talking video handler: one of the user's own generated photos + a script + a voice -> a lip-synced
 * video (the provider runs TTS, then avatar animation). The script goes through the prompt safety
 * filter (engine: assertTextAllowed on `textsToModerate`) and is capped at MAX_TALKING_SECONDS of
 * estimated speech. Completion uses the engine's default video ingestion.
 */
import { and, eq } from "drizzle-orm";
import { MAX_TALKING_SECONDS, MAX_TALKING_WORDS } from "@/components/video/video-options";
import { estimateSpeechSeconds } from "@/config/credits";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { getVideoProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { providerInputUrl } from "@/server/media/service";
import type { VOICES } from "@/types/domain";
import { defineHandler } from "./types";
import { getVideoSourcePhoto } from "./video";

/** How far up the edit chain (edit of an edit of ...) we look for a Together photo. */
const MAX_LINEAGE_HOPS = 8;

/** Persisted on jobs.output.plan (JSON). `prompt` (= the script) becomes the media prompt. */
export type TalkingVideoPlanData = {
  script: string;
  prompt: string;
  voice: (typeof VOICES)[number];
  estimatedSeconds: number;
  sourceKey: string;
  sourceMime: string;
};

export function assertScriptLength(script: string): number {
  const seconds = estimateSpeechSeconds(script);
  if (seconds > MAX_TALKING_SECONDS) {
    throw errors.validation(
      `Keep your script to about ${MAX_TALKING_SECONDS} seconds of speech (~${MAX_TALKING_WORDS} words). This one is about ${seconds} seconds.`,
      { estimatedSeconds: seconds, maxSeconds: MAX_TALKING_SECONDS },
    );
  }
  return seconds;
}

/**
 * Talking videos put words in someone's mouth, so they are only made from photos of the user alone.
 * The other person in a Together photo consented to photos, not to speaking. Checks the source and
 * the photos it was edited from.
 */
async function assertSoloSource(userId: string, source: MediaRow): Promise<void> {
  let current: { jobId: string | null; parentMediaId: string | null } | undefined = source;
  for (let hop = 0; current && hop < MAX_LINEAGE_HOPS; hop++) {
    if (current.jobId) {
      const [job] = await db
        .select({ type: jobs.type })
        .from(jobs)
        .where(and(eq(jobs.id, current.jobId), eq(jobs.userId, userId)))
        .limit(1);
      if (job?.type === "multi_person") {
        throw errors.validation("Talking videos can only be made from photos of you alone, not Together photos.");
      }
    }
    if (!current.parentMediaId) return;
    [current] = await db
      .select({ jobId: media.jobId, parentMediaId: media.parentMediaId })
      .from(media)
      .where(and(eq(media.id, current.parentMediaId), eq(media.userId, userId)))
      .limit(1);
  }
}

export default defineHandler({
  type: "talking_video",

  async plan({ user, input }) {
    const script = input.script.trim();
    const estimatedSeconds = assertScriptLength(script);
    const source = await getVideoSourcePhoto(user.id, input.sourceMediaId);
    await assertSoloSource(user.id, source);
    const data: TalkingVideoPlanData = {
      script,
      prompt: script,
      voice: input.voice,
      estimatedSeconds,
      sourceKey: source.storageKey,
      sourceMime: source.mimeType,
    };
    return { modelId: source.modelId, sourceMediaId: source.id, textsToModerate: [script], data };
  },

  async submit({ plan, submitOpts }) {
    const data = plan.data as TalkingVideoPlanData;
    const imageUrl = await providerInputUrl(data.sourceKey, data.sourceMime);
    return getVideoProvider().submitTalkingVideo({ imageUrl, script: data.script, voice: data.voice }, submitOpts);
  },
});
