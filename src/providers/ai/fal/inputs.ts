/**
 * Pure fal request builders, one per capability, typed against the endpoint schemas shipped with
 * @fal-ai/client (so a renamed parameter fails the typecheck). Endpoint ids come from MODELS.fal only.
 *
 * Safety invariants (never configurable): `enable_safety_checker: true` on every endpoint that has it,
 * strictest `safety_tolerance` on Nano Banana, conservative FASHN garment moderation.
 */
import type {
  BirefnetV2Input,
  codeformerInput,
  CrystalUpscalerInput,
  FashnTryonV16Input,
  FluxLoraFastTrainingInput,
  FluxLoraInpaintingInput,
  FluxLoraInput,
  KlingVideoAiAvatarV2StandardInput,
  KlingVideoV3StandardImageToVideoInput,
  MinimaxSpeech28TurboInput,
  NanoBanana2EditInput,
  routerInput,
} from "@fal-ai/client/endpoints";
import { MODELS } from "@/config/models";
import type {
  EditInput,
  GenerateInput,
  IdentityRef,
  ImageToVideoInput,
  InpaintInput,
  PromptHelperInput,
  TalkingVideoInput,
  TrainingInput,
  TryOnInput,
  UpscaleInput,
} from "@/providers/types";
import type { Quality } from "@/types/domain";
import { ProviderRequestError } from "@/providers/ai/shared/errors";
import { fitAspectRatio, MEGAPIXEL, type FitOptions } from "@/providers/ai/shared/sizes";
import {
  containsTrigger,
  instantGeneratePrompt,
  instructEditPrompt,
  MAX_IDENTITY_REFS,
  MAX_INSTANT_REFS,
  MAX_REFERENCE_IMAGES,
  multiPersonPrompt,
  poseCopyPrompt,
  replaceTrigger,
  type MultiPersonSlot,
} from "@/providers/ai/shared/identity-prompts";
import { buildPromptHelperUserMessage, PROMPT_HELPER_SYSTEM_PROMPT } from "@/providers/ai/shared/prompt-helper";

/* ───────────── Training ───────────── */

export const DEFAULT_TRAINING_STEPS = 1000;
/** Cost is linear in steps ($2 per 1000), so overrides are kept in a sane range. */
const TRAINING_STEPS_RANGE = { min: 250, max: 4000 } as const;

export function buildTrainingInput(input: TrainingInput): FluxLoraFastTrainingInput {
  const steps = Math.round(
    Math.min(TRAINING_STEPS_RANGE.max, Math.max(TRAINING_STEPS_RANGE.min, input.steps ?? DEFAULT_TRAINING_STEPS)),
  );
  return {
    images_data_url: input.imagesZipUrl,
    // Signed URLs may lack a ".zip" suffix, so the archive format is stated explicitly.
    data_archive_format: "zip",
    trigger_word: input.triggerWord,
    steps,
    create_masks: true,
    is_style: false,
  };
}

/* ───────────── Generation (trained LoRA) ───────────── */

interface QualityPreset extends FitOptions {
  steps: number;
  acceleration?: "regular";
}

/**
 * fal bills FLUX per megapixel rounded up: standard stays <= 1 MP and high <= 2 MP (more steps);
 * drafts are 512 px on the long side with few steps (faster, same price).
 */
export const FLUX_QUALITY: Record<Quality, QualityPreset> = {
  draft: { maxPixels: MEGAPIXEL, maxLongSide: 512, steps: 10, acceleration: "regular" },
  standard: { maxPixels: MEGAPIXEL, steps: 28 },
  high: { maxPixels: 2 * MEGAPIXEL, steps: 40 },
};
const FLUX_GUIDANCE = 3.5;

export function hasTrainedModel(identity: Pick<IdentityRef, "modelRef">): boolean {
  return identity.modelRef.trim().length > 0;
}

export function generateCapability(input: GenerateInput): "generate" | "draft" | "editMulti" {
  if (!hasTrainedModel(input.identity)) return "editMulti";
  return input.quality === "draft" ? "draft" : "generate";
}

export function buildLoraGenerateInput(input: GenerateInput): FluxLoraInput {
  const preset = FLUX_QUALITY[input.quality];
  // FLUX.1 [dev] has no negative prompt input, so `input.negativePrompt` is intentionally unused.
  // `input.referenceImageUrl` is ignored too: MODELS.fal has no LoRA image-to-image endpoint configured.
  return {
    prompt: input.prompt,
    loras: [{ path: input.identity.modelRef, scale: 1 }],
    image_size: fitAspectRatio(input.aspectRatio, preset),
    num_inference_steps: preset.steps,
    guidance_scale: FLUX_GUIDANCE,
    num_images: input.numImages,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(preset.acceleration ? { acceleration: preset.acceleration } : {}),
    output_format: "jpeg",
    enable_safety_checker: true,
  };
}

/* ───────────── Nano Banana (instant mode, edits) ───────────── */

/** Strictest level ("1"); not configurable. */
export const NANO_SAFETY_TOLERANCE = "1" as const;
const NANO_RESOLUTION: Record<Quality, NonNullable<NanoBanana2EditInput["resolution"]>> = {
  draft: "0.5K",
  standard: "1K",
  high: "2K",
};
const NANO_SYSTEM_PROMPT =
  "You are a careful portrait photographer and photo retoucher. Preserve the identity of the people in the " +
  "reference photos exactly. Never create nudity, sexual or suggestive content, minors, violence, or depictions " +
  "of celebrities or public figures. Output photorealistic images only.";

function nanoBase(): Pick<NanoBanana2EditInput, "safety_tolerance" | "output_format" | "system_prompt" | "limit_generations"> {
  return {
    safety_tolerance: NANO_SAFETY_TOLERANCE,
    output_format: "jpeg",
    system_prompt: NANO_SYSTEM_PROMPT,
    limit_generations: true,
  };
}

function invalid(message: string, endpoint: string): ProviderRequestError {
  return new ProviderRequestError({ provider: "fal", endpoint, message, retryable: false });
}

function refsOf(identity: IdentityRef | undefined, max: number): string[] {
  return (identity?.referenceImageUrls ?? []).filter((u) => typeof u === "string" && u.length > 0).slice(0, max);
}

/** Instant mode (no LoRA): the identity comes from the reference photos via the multi-image editor. */
export function buildInstantGenerateInput(input: GenerateInput): NanoBanana2EditInput {
  const refs = refsOf(input.identity, MAX_INSTANT_REFS);
  if (!refs.length) {
    throw invalid("This identity has neither a trained model nor reference photos.", MODELS.fal.editMulti.id);
  }
  const styleRef = input.referenceImageUrl ? [input.referenceImageUrl] : [];
  return {
    ...nanoBase(),
    prompt: instantGeneratePrompt({
      prompt: input.prompt,
      identity: input.identity,
      refCount: refs.length,
      styleRefIndex: styleRef.length ? refs.length + 1 : undefined,
    }),
    image_urls: [...refs, ...styleRef],
    aspect_ratio: input.aspectRatio,
    resolution: NANO_RESOLUTION[input.quality],
    num_images: input.numImages,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };
}

export function buildEditInput(input: EditInput): NanoBanana2EditInput {
  const endpoint = MODELS.fal.editMulti.id;
  const common = {
    ...nanoBase(),
    aspect_ratio: input.aspectRatio ?? ("auto" as const),
    resolution: NANO_RESOLUTION.standard,
    num_images: input.numImages,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };

  switch (input.mode) {
    case "instruct": {
      const [source, ...rest] = input.imageUrls;
      if (!source) throw invalid("An edit needs the image to edit.", endpoint);
      const refs = refsOf(input.identity, MAX_IDENTITY_REFS);
      const extras = rest.slice(0, Math.max(0, MAX_REFERENCE_IMAGES - 1 - refs.length));
      return {
        ...common,
        prompt: instructEditPrompt({
          instruction: input.prompt,
          identity: input.identity,
          identityRefCount: refs.length,
          extraRefCount: extras.length,
        }),
        image_urls: [source, ...refs, ...extras],
      };
    }
    case "pose_copy": {
      const pose = input.imageUrls[0];
      if (!pose) throw invalid("Pose copy needs a pose reference image.", endpoint);
      const identity = input.identity;
      const refs = refsOf(identity, MAX_IDENTITY_REFS);
      if (!identity || !refs.length) throw invalid("Pose copy needs reference photos of this identity.", endpoint);
      return {
        ...common,
        prompt: poseCopyPrompt({ prompt: input.prompt, identity, identityRefCount: refs.length }),
        image_urls: [pose, ...refs],
      };
    }
    case "multi_person": {
      const people = input.identities ?? [];
      if (people.length < 2) throw invalid("A together photo needs two identities.", endpoint);
      // `imageUrls` are optional scene/composition references; at most one is used, placed last.
      const sceneRefs = input.imageUrls.slice(0, 1);
      const perPerson = Math.min(MAX_IDENTITY_REFS, Math.floor((MAX_REFERENCE_IMAGES - sceneRefs.length) / people.length));
      const slots: MultiPersonSlot[] = [];
      const urls: string[] = [];
      for (const identity of people) {
        const refs = refsOf(identity, perPerson);
        if (!refs.length) throw invalid("Every person in a together photo needs reference photos.", endpoint);
        slots.push({ identity, start: urls.length + 1, count: refs.length });
        urls.push(...refs);
      }
      return {
        ...common,
        prompt: multiPersonPrompt({
          prompt: input.prompt,
          people: slots,
          sceneRefIndex: sceneRefs.length ? urls.length + 1 : undefined,
        }),
        image_urls: [...urls, ...sceneRefs],
      };
    }
  }
}

/* ───────────── Inpaint / upscale / restore / background / try-on ───────────── */

export function buildInpaintInput(input: InpaintInput): FluxLoraInpaintingInput {
  const identity = input.identity;
  const lora = identity && hasTrainedModel(identity) ? identity : undefined;
  let prompt = input.prompt.trim();
  if (lora) {
    // The LoRA only activates on its trigger word, which repainted faces need to stay on-identity.
    const trigger = lora.triggerWord.trim();
    if (trigger && !containsTrigger(prompt, trigger)) prompt = `photo of ${trigger} ${lora.subject}, ${prompt}`;
  } else if (identity) {
    prompt = replaceTrigger(prompt, identity, `the ${identity.subject}`);
  }
  return {
    image_url: input.imageUrl,
    mask_url: input.maskUrl,
    prompt,
    ...(lora ? { loras: [{ path: lora.modelRef, scale: 1 }] } : {}),
    strength: 0.85,
    num_inference_steps: FLUX_QUALITY.standard.steps,
    guidance_scale: FLUX_GUIDANCE,
    output_format: "jpeg",
    enable_safety_checker: true,
  };
}

/**
 * Crystal is portrait-tuned: it reconstructs faces while upscaling, so `faceRestore: true` needs no second
 * job (one ProviderJobRef cannot chain CodeFormer). `creativity` stays at the provider default to avoid
 * hallucinated facial detail.
 */
export function buildUpscaleInput(input: UpscaleInput): CrystalUpscalerInput {
  return {
    image_url: input.imageUrl,
    scale_factor: input.scale,
    output_format: "jpg",
    enable_safety_checker: true,
  };
}

/** CodeFormer below ~0.7 fidelity drifts away from the person's identity (docs/MODELS.md §B.5). */
export const CODEFORMER_FIDELITY = 0.7;

export function buildFaceRestoreInput(imageUrl: string): codeformerInput {
  return { image_url: imageUrl, fidelity: CODEFORMER_FIDELITY };
}

export function buildRemoveBackgroundInput(imageUrl: string): BirefnetV2Input {
  return {
    image_url: imageUrl,
    model: "Portrait",
    operating_resolution: "1024x1024",
    refine_foreground: true,
    output_format: "png",
  };
}

const TRY_ON_CATEGORY: Record<TryOnInput["category"], NonNullable<FashnTryonV16Input["category"]>> = {
  auto: "auto",
  tops: "tops",
  bottoms: "bottoms",
  "one-pieces": "one-pieces",
};

export function buildTryOnInput(input: TryOnInput): FashnTryonV16Input {
  return {
    model_image: input.personImageUrl,
    garment_image: input.garmentImageUrl,
    category: TRY_ON_CATEGORY[input.category] ?? "auto",
    mode: "balanced",
    garment_photo_type: "auto",
    // "conservative" also blocks underwear and swimwear garments.
    moderation_level: "conservative",
    num_samples: 1,
    output_format: "png",
    enable_safety_checker: true,
  };
}

/* ───────────── Video ───────────── */

const DEFAULT_MOTION_PROMPT =
  "Subtle, natural motion: the person breathes, blinks and smiles slightly while the camera slowly pushes in.";
const VIDEO_IDENTITY_SUFFIX = "Keep the person's face and identity consistent in every frame. Realistic, stable, cinematic.";
const VIDEO_NEGATIVE_PROMPT = "blur, distortion, face morphing, identity change, extra limbs, flicker, low quality";

export function buildImageToVideoInput(input: ImageToVideoInput): KlingVideoV3StandardImageToVideoInput {
  // Kling derives the frame from the start image, so `input.aspectRatio` is not sent.
  const motion = input.prompt.trim() || DEFAULT_MOTION_PROMPT;
  return {
    start_image_url: input.imageUrl,
    prompt: `${motion} ${VIDEO_IDENTITY_SUFFIX}`,
    negative_prompt: VIDEO_NEGATIVE_PROMPT,
    duration: input.durationSec === 10 ? "10" : "5",
    generate_audio: false,
    enable_safety_checker: true,
  };
}

/** Our voice names -> MiniMax system voice ids. Unknown names fall back to `neutral`. */
export const MINIMAX_VOICES = {
  warm_female: "Wise_Woman",
  bright_female: "Lively_Girl",
  calm_male: "Patient_Man",
  deep_male: "Deep_Voice_Man",
  neutral: "Friendly_Person",
} as const;

export function minimaxVoiceId(voice: string): string {
  return (MINIMAX_VOICES as Record<string, string>)[voice] ?? MINIMAX_VOICES.neutral;
}

export function buildTtsInput(input: TalkingVideoInput): MinimaxSpeech28TurboInput {
  return {
    prompt: input.script.trim(),
    voice_setting: { voice_id: minimaxVoiceId(input.voice), speed: 1 },
    language_boost: "auto",
    output_format: "url",
    enable_safety_checker: true,
  };
}

export function buildAvatarInput(imageUrl: string, audioUrl: string): KlingVideoAiAvatarV2StandardInput {
  return { image_url: imageUrl, audio_url: audioUrl, enable_safety_checker: true };
}

/* ───────────── Prompt helper (LLM) ───────────── */

/**
 * The OpenRouter model slug is configured in MODELS.fal.llm.notes ("input.model = '<slug>'"), the single
 * place model ids live. Returns null if the notes no longer carry it (the caller then uses the template).
 */
export function llmModelSlug(): string | null {
  const m = /input\.model\s*=\s*'([^']+)'/.exec(MODELS.fal.llm.notes);
  return m?.[1] ?? null;
}

export function buildLlmInput(model: string, input: PromptHelperInput): routerInput {
  return {
    model,
    system_prompt: PROMPT_HELPER_SYSTEM_PROMPT,
    prompt: buildPromptHelperUserMessage(input),
    temperature: 0.4,
    max_tokens: 400,
  };
}
