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
  upscale4x: 3,
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

/** Free drafts are capped per user per day to prevent abuse. */
export const DRAFT_DAILY_LIMIT = 200;

/** Words per second used to estimate talking-video duration from a script. */
export const SPEECH_WORDS_PER_SEC = 2.5;

export function estimateSpeechSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / SPEECH_WORDS_PER_SEC));
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
