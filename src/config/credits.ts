/**
 * Credit costs per action. 1 credit ≈ 1 standard photo. CONTRACT FILE.
 * Provider cost estimates live in src/config/models.ts; keep margins positive.
 */
import type { JobInput, JobType } from "@/types/domain";

export const CREDIT_COSTS = {
  train: 40,
  /** Per image. */
  generateDraft: 0,
  generateStandard: 1,
  generateHigh: 2,
  /** Per image. */
  poseCopy: 2,
  edit: 2,
  inpaint: 2,
  upscale2x: 2,
  upscale4x: 5,
  faceRestore: 1,
  removeBackground: 1,
  tryOn: 3,
  /** Per image. */
  multiPerson: 3,
  video5s: 10,
  video10s: 18,
  /** Per started 5 seconds of estimated speech. */
  talkingVideoPer5s: 8,
  promptHelper: 0,
} as const;

/**
 * Free drafts are capped per user per day (drafts are faster, not much cheaper, at the provider).
 * Users who never paid get a smaller allowance (see rate-limits draftsPerDay / draftsPerDayFree).
 */
export const DRAFT_DAILY_LIMIT = 30;
export const DRAFT_DAILY_LIMIT_FREE = 5;

/**
 * Instant (reference-based) identity models run on a multi-reference edit model that costs
 * ~2x a LoRA generation, so they cost more credits per image. Applied via JobPlan.credits.
 */
export const INSTANT_MODE_MULTIPLIER = 2;

/** Words per second used to estimate talking-video duration from a script. */
export const SPEECH_WORDS_PER_SEC = 2.5;
/** Other letters, punctuation and symbols per second (catches scripts without spaces, e.g. "a-b-c-…"). */
export const SPEECH_CHARS_PER_SEC = 15;
/** Digits per second: numbers are read out as words (and long digit runs digit by digit). */
export const SPEECH_DIGITS_PER_SEC = 3;
/** Chinese / Japanese / Korean characters per second: each one is a syllable or more. */
export const SPEECH_CJK_CHARS_PER_SEC = 5;
/**
 * The provider refuses to animate speech audio longer than the paid duration times this (avatar
 * models bill per second); covers voices that speak slower than the estimate.
 */
export const TALKING_AUDIO_TOLERANCE = 1.5;

/** Motion prompt used for photo-to-video when the user leaves it blank. */
export const DEFAULT_MOTION_PROMPT = "subtle natural motion, gentle camera push-in, realistic";
/** Longest talking video we make, in estimated seconds of speech. */
export const MAX_TALKING_SECONDS = 60;
/** Word budget that fits in MAX_TALKING_SECONDS at the estimator's speaking rate. */
export const MAX_TALKING_WORDS = Math.floor(MAX_TALKING_SECONDS * SPEECH_WORDS_PER_SEC);

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
/** A spoken word: letters / digits, with inner apostrophes ("don't"). Hyphens and dots split words. */
const SPOKEN_WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/**
 * Estimated seconds of speech for a talking-video script: the larger of a word-based and a
 * character-based estimate, so scripts that defeat a whitespace word count (CJK text, digit runs,
 * "a-b-c-…") are priced and capped by their real length. Shared by pricing, the 60 s cap (server)
 * and the script editor (UI).
 */
export function estimateSpeechSeconds(script: string): number {
  const words = script.replace(CJK_CHARS, " ").match(SPOKEN_WORD)?.length ?? 0;
  let cjk = 0;
  let digits = 0;
  let other = 0;
  for (const ch of script) {
    if (CJK_CHAR.test(ch)) cjk++;
    else if (/\p{N}/u.test(ch)) digits++;
    else if (/[\p{L}\p{P}\p{S}]/u.test(ch)) other++;
  }
  const byChars = other / SPEECH_CHARS_PER_SEC + digits / SPEECH_DIGITS_PER_SEC + cjk / SPEECH_CJK_CHARS_PER_SEC;
  const seconds = Math.max(words / SPEECH_WORDS_PER_SEC, byChars);
  // The epsilon absorbs float noise (e.g. 3 × 1/3) so whole seconds don't round up.
  return Math.max(1, Math.ceil(seconds - 1e-9));
}

/** Longest speech audio (seconds) a talking video with this estimate may animate (see TALKING_AUDIO_TOLERANCE). */
export function maxTalkingAudioSeconds(estimatedSeconds: number): number {
  const paid = Math.ceil(Math.min(estimatedSeconds, MAX_TALKING_SECONDS) / 5) * 5;
  return Math.ceil(paid * TALKING_AUDIO_TOLERANCE);
}

/** Credits charged up-front for a job. Refunded automatically on failure. */
export function creditCost(input: JobInput): number {
  switch (input.type) {
    case "train":
      return CREDIT_COSTS.train;
    case "generate": {
      const per =
        input.quality === "draft"
          ? CREDIT_COSTS.generateDraft
          : input.quality === "high"
            ? CREDIT_COSTS.generateHigh
            : CREDIT_COSTS.generateStandard;
      return per * (input.fromDraftMediaId ? 1 : input.numImages);
    }
    case "pose_copy":
      return CREDIT_COSTS.poseCopy * input.numImages;
    case "edit":
      return CREDIT_COSTS.edit * input.numImages;
    case "inpaint":
      return CREDIT_COSTS.inpaint;
    case "upscale":
      return input.scale === 4 ? CREDIT_COSTS.upscale4x : CREDIT_COSTS.upscale2x;
    case "face_restore":
      return CREDIT_COSTS.faceRestore;
    case "remove_background":
      return CREDIT_COSTS.removeBackground;
    case "try_on":
      return CREDIT_COSTS.tryOn;
    case "multi_person":
      return CREDIT_COSTS.multiPerson * input.numImages;
    case "video":
      return input.durationSec === 10 ? CREDIT_COSTS.video10s : CREDIT_COSTS.video5s;
    case "talking_video":
      return CREDIT_COSTS.talkingVideoPer5s * Math.ceil(estimateSpeechSeconds(input.script) / 5);
  }
}

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  train: "Model training",
  generate: "Photo generation",
  pose_copy: "Pose copy",
  edit: "Edit",
  inpaint: "Brush edit",
  upscale: "Upscale",
  face_restore: "Face restore",
  remove_background: "Background removal",
  video: "Photo to video",
  talking_video: "Talking video",
  try_on: "Virtual try-on",
  multi_person: "Together photo",
};
