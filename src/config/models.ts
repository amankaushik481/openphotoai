/**
 * Every AI model/endpoint id lives here — never hard-code ids elsewhere. CONTRACT FILE.
 * Ids + prices verified against provider docs (see docs/MODELS.md for sources and dates).
 * costUsd = estimated provider cost per call (per image for image endpoints) used for
 * admin cost reporting and README cost estimates.
 */
export type Capability =
  | "train"
  | "generate"
  | "draft"
  | "editMulti"
  | "inpaint"
  | "upscale"
  | "faceRestore"
  | "removeBg"
  | "imageToVideo"
  | "tts"
  | "talkingVideo"
  | "tryOn"
  | "llm"
  | "nsfw";

export interface ModelSpec {
  id: string;
  /** Replicate only: pinned version hash when the model requires one. */
  version?: string;
  costUsd: number;
  notes?: string;
}

export const MODELS: Record<"fal" | "replicate", Record<Capability, ModelSpec>> = {
  fal: {
    train: { id: "fal-ai/flux-lora-fast-training", costUsd: 2.0, notes: "Placeholder — finalized from docs/MODELS.md" },
    generate: { id: "fal-ai/flux-lora", costUsd: 0.035 },
    draft: { id: "fal-ai/flux-lora", costUsd: 0.01, notes: "fewer steps + smaller size" },
    editMulti: { id: "fal-ai/nano-banana/edit", costUsd: 0.039 },
    inpaint: { id: "fal-ai/flux-lora/inpainting", costUsd: 0.035 },
    upscale: { id: "fal-ai/clarity-upscaler", costUsd: 0.05 },
    faceRestore: { id: "fal-ai/codeformer", costUsd: 0.01 },
    removeBg: { id: "fal-ai/birefnet/v2", costUsd: 0.01 },
    imageToVideo: { id: "fal-ai/kling-video/v2.1/standard/image-to-video", costUsd: 0.25 },
    tts: { id: "fal-ai/minimax/speech-02-hd", costUsd: 0.01 },
    talkingVideo: { id: "fal-ai/bytedance/omnihuman", costUsd: 1.5 },
    tryOn: { id: "fal-ai/fashn/tryon/v1.6", costUsd: 0.075 },
    llm: { id: "fal-ai/any-llm", costUsd: 0.001 },
    nsfw: { id: "fal-ai/imageutils/nsfw", costUsd: 0.001 },
  },
  replicate: {
    train: { id: "ostris/flux-dev-lora-trainer", costUsd: 2.5 },
    generate: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.035 },
    draft: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.01 },
    editMulti: { id: "google/nano-banana", costUsd: 0.039 },
    inpaint: { id: "black-forest-labs/flux-fill-dev", costUsd: 0.04 },
    upscale: { id: "philz1337x/clarity-upscaler", costUsd: 0.05 },
    faceRestore: { id: "sczhou/codeformer", costUsd: 0.01 },
    removeBg: { id: "men1scus/birefnet", costUsd: 0.01 },
    imageToVideo: { id: "kwaivgi/kling-v2.1", costUsd: 0.25 },
    tts: { id: "minimax/speech-02-hd", costUsd: 0.01 },
    talkingVideo: { id: "bytedance/omni-human", costUsd: 1.5 },
    tryOn: { id: "cuuupid/idm-vton", costUsd: 0.05 },
    llm: { id: "meta/meta-llama-3-8b-instruct", costUsd: 0.001 },
    nsfw: { id: "falcons-ai/nsfw_image_detection", costUsd: 0.001 },
  },
};

/** Mock provider pseudo-costs (shown in admin so the cost UI is exercised in demo mode). */
export const MOCK_COST_USD: Record<Capability, number> = {
  train: 2,
  generate: 0.035,
  draft: 0.004,
  editMulti: 0.04,
  inpaint: 0.035,
  upscale: 0.03,
  faceRestore: 0.005,
  removeBg: 0.005,
  imageToVideo: 0.3,
  tts: 0.01,
  talkingVideo: 1.2,
  tryOn: 0.07,
  llm: 0.0005,
  nsfw: 0,
};
