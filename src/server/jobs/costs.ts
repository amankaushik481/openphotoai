/**
 * Provider cost estimates (admin cost reporting) + expected output counts (proportional refunds).
 * Model ids/prices come only from src/config/models.ts.
 */
import { estimateSpeechSeconds } from "@/config/credits";
import { MOCK_COST_USD, MODELS, type Capability } from "@/config/models";
import type { AIProviderName, JobInput } from "@/types/domain";

function unitCost(provider: AIProviderName, cap: Capability): number {
  return provider === "mock" ? MOCK_COST_USD[cap] : MODELS[provider][cap].costUsd;
}

/**
 * Estimated provider cost in USD for a job. `planData.identityMode === "instant"` marks generations
 * that run on the multi-reference edit model instead of a LoRA.
 */
export function estimateCostUsd(input: JobInput, provider: AIProviderName, planData?: Record<string, unknown>): number {
  const cost = (cap: Capability, units = 1) => unitCost(provider, cap) * units;
  const instant = planData?.identityMode === "instant";
  let usd: number;
  switch (input.type) {
    case "train":
      usd = cost("train");
      break;
    case "generate": {
      const n = input.fromDraftMediaId ? 1 : input.numImages;
      usd = cost(instant ? "editMulti" : input.quality === "draft" ? "draft" : "generate", n);
      break;
    }
    case "pose_copy":
    case "edit":
    case "multi_person":
      usd = cost("editMulti", input.numImages);
      break;
    case "inpaint":
      usd = cost("inpaint");
      break;
    case "upscale":
      usd = cost("upscale", input.scale === 4 ? 2 : 1);
      break;
    case "face_restore":
      usd = cost("faceRestore");
      break;
    case "remove_background":
      usd = cost("removeBg");
      break;
    case "try_on":
      usd = cost("tryOn");
      break;
    case "video":
      // imageToVideo is priced per 5s clip.
      usd = cost("imageToVideo", input.durationSec / 5);
      break;
    case "talking_video":
      // TTS priced per ~500-char script, avatar video per 30s.
      usd = cost("tts") + cost("talkingVideo", estimateSpeechSeconds(input.script) / 30);
      break;
  }
  return Math.round(usd * 10_000) / 10_000;
}

/** How many outputs a job is expected to produce (credits are split evenly across them). */
export function expectedOutputs(input: JobInput): number {
  if (input.type === "generate") return input.fromDraftMediaId ? 1 : input.numImages;
  if ("numImages" in input && typeof input.numImages === "number") return Math.max(1, input.numImages);
  return 1;
}
