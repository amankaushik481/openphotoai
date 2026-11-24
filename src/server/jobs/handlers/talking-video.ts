/**
 * Talking video handler: one of the user's own generated photos + a script + a voice -> a lip-synced
 * video (the provider runs TTS, then avatar animation). The script goes through the prompt safety
 * filter (engine: assertTextAllowed on `textsToModerate`) and is capped at MAX_TALKING_SECONDS of
 * estimated speech (`estimateSpeechSeconds`: words and characters, so CJK / digit scripts count).
 * The provider also refuses TTS audio longer than the paid duration (`maxAudioSeconds`) before
 * starting the per-second avatar step. Completion uses the engine's default video ingestion.
 */
import { MAX_TALKING_SECONDS, MAX_TALKING_WORDS } from "@/config/credits";
import { estimateSpeechSeconds, maxTalkingAudioSeconds } from "@/config/credits";
import { AudioTooLongError } from "@/providers/ai/shared/errors";
import { getVideoProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { providerInputUrl } from "@/server/media/service";
import type { VOICES } from "@/types/domain";
import { defineHandler } from "./types";
import { assertSoloSource } from "../lineage";
import { getVideoSourcePhoto } from "./video";

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

export { assertSoloSource } from "../lineage";

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
    // Providers that report the TTS duration refuse to animate more speech than this job paid for.
    const maxAudioSeconds = maxTalkingAudioSeconds(data.estimatedSeconds);
    try {
      return await getVideoProvider().submitTalkingVideo(
        { imageUrl, script: data.script, voice: data.voice, maxAudioSeconds },
        submitOpts,
      );
    } catch (err) {
      if (err instanceof AudioTooLongError) {
        throw errors.validation(
          `Your script runs longer when spoken (${Math.round(err.audioSeconds)}s) than estimated. Shorten it and try again — your credits were refunded.`,
          { audioSeconds: err.audioSeconds, maxSeconds: err.maxSeconds },
        );
      }
      throw err;
    }
  },
});
