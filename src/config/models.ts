/**
 * Every AI model/endpoint id lives here — never hard-code ids elsewhere. CONTRACT FILE.
 * Ids + prices researched 2026-11-24 (see docs/MODELS.md for sources, params and caveats).
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
  /** fal endpoint id, or Replicate "owner/name". */
  id: string;
  /** Replicate community models only; "latest" = resolve via models.get() at runtime (cache it). */
  version?: string;
  /** Estimated provider cost per call (see `unit`). */
  costUsd: number;
  unit: string;
  notes: string;
  /** Alternatives worth A/B testing (see docs/MODELS.md). */
  alt?: readonly string[];
  /** Structured extra parameters (e.g. the OpenRouter model slug for the fal LLM router). */
  params?: Readonly<Record<string, string | number | boolean>>;
}

// Snapshot 2026-11-24 — see docs/MODELS.md for sources, parameters and UNVERIFIED notes.
export const MODELS = {
  fal: {
    train: { id: "fal-ai/flux-lora-fast-training", costUsd: 2.0, unit: "run @1000 steps (linear)",
      notes: "images_data_url=zip, trigger_word, steps 1000-1500, create_masks=true -> diffusers_lora_file.url",
      alt: ["blackforestlabs/flux-3/klein/base/trainer", "fal-ai/flux-lora-portrait-trainer", "fal-ai/qwen-image-2512-trainer-v2"] },
    generate: { id: "fal-ai/flux-lora", costUsd: 0.035, unit: "image <=1MP (billed per MP, rounded up)",
      notes: "loras:[{path,scale}], 28 steps, guidance 3.5 -> images[0].url, has_nsfw_concepts[0]",
      alt: ["blackforestlabs/flux-3/klein/text-to-image/lora"] },
    draft: { id: "fal-ai/flux-lora", costUsd: 0.035, unit: "image 512x640",
      notes: "num_inference_steps 8-12, acceleration 'regular'; faster not cheaper. Klein draft ~$0.004",
      alt: ["fal-ai/flux-lora/stream", "blackforestlabs/flux-3/klein/text-to-image/lora"] },
    editMulti: { id: "fal-ai/nano-banana-2/edit", costUsd: 0.08, unit: "image @1K",
      notes: "image_urls (<=14), resolution 0.5K/1K/2K/4K, safety_tolerance '1'-'6' -> images[0].url",
      alt: ["google/nano-banana-2.1/edit", "bytedance/seedream/v5/pro/edit", "blackforestlabs/flux-3/klein/edit-image/lora"] },
    inpaint: { id: "fal-ai/flux-lora/inpainting", costUsd: 0.035, unit: "image <=1MP",
      notes: "image_url, mask_url (white=repaint), loras = user LoRA, strength 0.85", alt: ["fal-ai/flux-pro/v1/fill"] },
    upscale: { id: "clarityai/crystal-upscaler", costUsd: 0.064, unit: "2x of 1MP (=4MP out @ $0.016/MP)",
      notes: "portrait-tuned; scale_factor, creativity -> images[0].url", alt: ["fal-ai/seedvr/upscale/image"] },
    faceRestore: { id: "fal-ai/codeformer", costUsd: 0.005, unit: "image ($0.0021/MP)",
      notes: "fidelity >=0.7 to preserve identity -> image.url", alt: ["fal-ai/image-editing/face-enhancement"] },
    removeBg: { id: "fal-ai/birefnet/v2", costUsd: 0.002, unit: "image (compute-second billing, UNVERIFIED)",
      notes: "model 'Portrait' -> image.url", alt: ["fal-ai/bria/background/remove"] },
    imageToVideo: { id: "fal-ai/kling-video/v3/standard/image-to-video", costUsd: 0.42, unit: "5s clip, audio off",
      notes: "start_image_url, duration '5', generate_audio false -> video.url",
      alt: ["fal-ai/kling-video/v2.5-turbo/standard/image-to-video", "bytedance/seedance-2.0/fast/image-to-video"] },
    tts: { id: "fal-ai/minimax/speech-2.8-turbo", costUsd: 0.03, unit: "500-char script ($0.06/1k chars)",
      notes: "prompt, voice_setting.voice_id, output_format 'url' -> audio.url", alt: ["elevenlabs/tts/eleven-v4"] },
    talkingVideo: { id: "fal-ai/kling-video/ai-avatar/v2/standard", costUsd: 1.69, unit: "30s video ($0.0562/s)",
      notes: "image_url + audio_url -> video.url (alias: lipsync)",
      alt: ["fal-ai/bytedance/omnihuman/v1.5", "veed/fabric-1.0/text", "fal-ai/sync-lipsync/v3"] },
    tryOn: { id: "fal-ai/fashn/tryon/v1.6", costUsd: 0.075, unit: "generation",
      notes: "model_image, garment_image, category 'auto', mode 'balanced' -> images[0].url", alt: ["google/virtual-try-on"] },
    llm: { id: "openrouter/router", costUsd: 0.0005, unit: "prompt-helper call (~600 tokens)",
      notes: "input.model = 'google/gemini-3.1-flash-lite'; fal.run; output = data.output", alt: ["openrouter/router/vision"],
      params: { model: "google/gemini-3.1-flash-lite" } },
    nsfw: { id: "fal-ai/x-ailab/nsfw", costUsd: 0.001, unit: "image",
      notes: "image_urls (<=10) -> has_nsfw_concepts[]", alt: ["fal-ai/imageutils/nsfw"] },
  },
  replicate: {
    train: { id: "replicate/fast-flux-trainer", version: "latest", costUsd: 1.5, unit: "run (~2 min on 8xH200)",
      notes: "trainings.create(..., {destination, input:{input_images, trigger_word, lora_type:'subject'}}) -> output.weights/version",
      alt: ["ostris/flux-dev-lora-trainer"] },
    generate: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.032, unit: "image",
      notes: "lora_weights = training.output.weights; output string[]" },
    draft: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.032, unit: "image",
      notes: "num_inference_steps 8, megapixels '0.25', go_fast true (cost reduction UNVERIFIED)",
      alt: ["black-forest-labs/flux-schnell-lora"] },
    editMulti: { id: "google/nano-banana-2", costUsd: 0.08, unit: "image @1K (UNVERIFIED)",
      notes: "image_input (<=14) -> URL", alt: ["bytedance/seedream-5-pro", "google/nano-banana-pro"] },
    inpaint: { id: "black-forest-labs/flux-fill-pro", costUsd: 0.05, unit: "image",
      notes: "image + mask; identity-aware: trained destination model with image+mask" },
    upscale: { id: "topazlabs/image-upscale", costUsd: 0.05, unit: "unit (UNVERIFIED)",
      notes: "face enhancement option", alt: ["philz1337x/crystal-upscaler", "recraft-ai/recraft-crisp-upscale"] },
    faceRestore: { id: "sczhou/codeformer", version: "latest", costUsd: 0.005, unit: "image (GPU-seconds, UNVERIFIED)",
      notes: "codeformer_fidelity >=0.7 (param name UNVERIFIED)", alt: ["tencentarc/gfpgan"] },
    removeBg: { id: "men1scus/birefnet", version: "f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
      costUsd: 0.002, unit: "image (GPU-seconds, UNVERIFIED)", notes: "image -> URL" },
    imageToVideo: { id: "kwaivgi/kling-v2.5-turbo-pro", costUsd: 0.35, unit: "5s clip ($0.07/s)",
      notes: "start_image, duration 5|10 -> URL", alt: ["kwaivgi/kling-v3-video"] },
    tts: { id: "minimax/speech-2.6-turbo", costUsd: 0.03, unit: "500-char script ($0.06/1k)", notes: "text, voice_id -> URL" },
    talkingVideo: { id: "bytedance/omni-human-1.5", costUsd: 4.8, unit: "30s video (~$0.16/s, UNVERIFIED)",
      notes: "image + audio -> URL", alt: ["kwaivgi/kling-avatar-v2"] },
    tryOn: { id: "google/nano-banana-2", costUsd: 0.08, unit: "image",
      notes: "image_input [person, garment] + instruction. cuuupid/idm-vton is NON-COMMERCIAL: do not use" },
    llm: { id: "openai/gpt-5-mini", costUsd: 0.001, unit: "prompt-helper call",
      notes: "prompt, system_prompt; output string[] -> join('')" },
    nsfw: { id: "falcons-ai/nsfw_image_detection", version: "97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d",
      costUsd: 0.0005, unit: "image (UNVERIFIED)", notes: "image -> 'normal' | 'nsfw'" },
  },
} as const satisfies Record<"fal" | "replicate", Record<Capability, ModelSpec>>;

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
