/**
 * Pure builders: provider-agnostic inputs -> Replicate model + input payloads. Parameter names follow
 * docs/MODELS.md (several are UNVERIFIED there; validate against each model's openapi_schema before launch).
 * Safety checkers are always on where the model exposes them.
 */
import { MODELS } from "@/config/models";
import type {
  EditInput,
  GenerateInput,
  IdentityRef,
  ImageToVideoInput,
  InpaintInput,
  PromptHelperInput,
  TrainingInput,
  TryOnInput,
  UpscaleInput,
} from "@/providers/types";
import { ProviderRequestError } from "../shared/errors";
import { buildPromptHelperUserMessage, PROMPT_HELPER_SYSTEM_PROMPT } from "../shared/prompt-helper";
import {
  DEFAULT_MOTION_PROMPT,
  instructEditPrompt,
  multiPersonPrompt,
  poseCopyPrompt,
  referenceGenerationPrompt,
  replaceTriggerPhrase,
  tryOnPrompt,
} from "./instructions";
import { decodeModelRef, loraWeightsFor } from "./refs";

const R = MODELS.replicate;

/** flux-dev-lora accepts at most 4 outputs per prediction. */
export const MAX_FLUX_OUTPUTS = 4;
/** google/nano-banana-2 accepts up to 14 reference images. */
export const MAX_REFERENCE_IMAGES = 14;
/** References per person in multi-person scenes (keeps room for both people within the 14-image cap). */
const MAX_REFS_PER_PERSON = 4;
/** BFL `safety_tolerance`: 1 = strictest, 6 = most permissive. */
export const STRICT_SAFETY_TOLERANCE = 1;
/** Google image models' strictest `safety_filter_level`. */
export const STRICT_SAFETY_FILTER = "block_low_and_above";
const MAX_SEED = 2_147_483_647;

export interface ModelTargetSpec {
  /** Replicate "owner/name"; also used as ProviderJobRef.endpoint. */
  id: string;
  /** Explicit version hash, or "latest" to resolve at runtime. Omitted for official models. */
  version?: string;
}

/** One job = one model and one or more predictions (each `inputs` entry becomes a prediction). */
export interface PredictionPlan {
  spec: ModelTargetSpec;
  inputs: Record<string, unknown>[];
}

const FLUX_STEPS: Record<GenerateInput["quality"], number> = { draft: 8, standard: 28, high: 40 };

/* ─────────────── Generation ─────────────── */

export function generatePlan(input: GenerateInput): PredictionPlan {
  const count = Math.max(1, Math.floor(input.numImages));
  const lora = loraFor(input.identity);
  return lora ? fluxLoraPlan(input, lora, count) : referenceGeneratePlan(input, count);
}

function fluxLoraPlan(input: GenerateInput, loraWeights: string, count: number): PredictionPlan {
  const draft = input.quality === "draft";
  const base: Record<string, unknown> = {
    prompt: input.prompt,
    lora_weights: loraWeights,
    lora_scale: 1,
    aspect_ratio: input.aspectRatio,
    num_inference_steps: FLUX_STEPS[input.quality],
    guidance: 3,
    megapixels: draft ? "0.25" : "1",
    go_fast: draft,
    output_format: input.quality === "high" ? "png" : "jpg",
    output_quality: 95,
    disable_safety_checker: false,
  };
  if (input.referenceImageUrl) {
    base.image = input.referenceImageUrl;
    // img2img: higher prompt_strength = further from the reference.
    base.prompt_strength = clamp(1 - (input.referenceStrength ?? 0.35), 0.3, 0.95);
  }
  const inputs = splitCount(count, MAX_FLUX_OUTPUTS).map((n, i) => ({
    ...base,
    num_outputs: n,
    ...(input.seed !== undefined ? { seed: (input.seed + i) % (MAX_SEED + 1) } : {}),
  }));
  return { spec: draft ? R.draft : R.generate, inputs };
}

/** Instant-mode identities (no LoRA): generate from the identity's reference photos. */
function referenceGeneratePlan(input: GenerateInput, count: number): PredictionPlan {
  const refs = input.identity.referenceImageUrls ?? [];
  if (refs.length === 0) throw invalid("This identity has neither trained weights nor reference photos.");
  const style = input.referenceImageUrl ? [input.referenceImageUrl] : [];
  const identityImages = refs.slice(0, MAX_REFERENCE_IMAGES - style.length);
  const payload = {
    prompt: referenceGenerationPrompt(input.prompt, input.identity, {
      styleImage: style.length > 0,
      identityImages: identityImages.length,
    }),
    image_input: [...style, ...identityImages],
    aspect_ratio: input.aspectRatio,
    resolution: input.quality === "high" ? "2K" : "1K",
    output_format: "jpg",
    safety_filter_level: STRICT_SAFETY_FILTER,
  };
  return { spec: R.editMulti, inputs: repeat(payload, count) };
}

/* ─────────────── Edits ─────────────── */

export function editPlan(input: EditInput): PredictionPlan {
  const count = Math.max(1, Math.floor(input.numImages));
  switch (input.mode) {
    case "instruct": {
      if (input.imageUrls.length === 0) throw invalid("An edit needs a source image.");
      return nanoBananaPlan(
        { prompt: instructEditPrompt(input.prompt), image_input: input.imageUrls.slice(0, MAX_REFERENCE_IMAGES) },
        input.aspectRatio,
        count,
      );
    }
    case "pose_copy":
      return poseCopyPlan(input, count);
    case "multi_person":
      return multiPersonPlan(input, count);
  }
}

function poseCopyPlan(input: EditInput, count: number): PredictionPlan {
  const pose = input.imageUrls[0];
  const identity = input.identity;
  if (!pose || !identity) throw invalid("Pose copy needs a reference image and an identity.");
  const refs = (identity.referenceImageUrls ?? []).slice(0, MAX_REFERENCE_IMAGES - 1);
  if (refs.length > 0) {
    return nanoBananaPlan(
      { prompt: poseCopyPrompt(input.prompt, identity, refs.length), image_input: [pose, ...refs] },
      input.aspectRatio,
      count,
    );
  }
  const lora = loraFor(identity);
  if (!lora) throw invalid("This identity has neither trained weights nor reference photos.");
  // Trained LoRA without reference photos: img2img from the pose reference.
  return fluxLoraPlan(
    {
      prompt: withTriggerPhrase(input.prompt || "natural pose, same setting and lighting", identity),
      identity,
      aspectRatio: input.aspectRatio ?? "4:5",
      numImages: count,
      quality: "standard",
      seed: input.seed,
      referenceImageUrl: pose,
      referenceStrength: 0.2,
    },
    lora,
    count,
  );
}

function multiPersonPlan(input: EditInput, count: number): PredictionPlan {
  const identities = input.identities ?? [];
  if (identities.length < 2) throw invalid("A together photo needs two identities.");
  const perPerson = Math.min(MAX_REFS_PER_PERSON, Math.floor(MAX_REFERENCE_IMAGES / identities.length));
  const images: string[] = [];
  const people = identities.map((identity) => {
    const refs = (identity.referenceImageUrls ?? []).slice(0, perPerson);
    if (refs.length === 0) throw invalid("Every person in a together photo needs reference photos.");
    const from = images.length + 1;
    images.push(...refs);
    return { identity, from, to: images.length };
  });
  return nanoBananaPlan(
    { prompt: multiPersonPrompt(input.prompt, people), image_input: images },
    input.aspectRatio,
    count,
  );
}

function nanoBananaPlan(
  payload: { prompt: string; image_input: string[] },
  aspectRatio: string | undefined,
  count: number,
): PredictionPlan {
  return {
    spec: R.editMulti,
    inputs: repeat(
      {
        ...payload,
        aspect_ratio: aspectRatio ?? "match_input_image",
        resolution: "1K",
        output_format: "jpg",
        safety_filter_level: STRICT_SAFETY_FILTER,
      },
      count,
    ),
  };
}

export function inpaintPlan(input: InpaintInput): PredictionPlan {
  const ref = input.identity ? decodeModelRef(input.identity.modelRef) : null;
  if (ref?.model && ref.version) {
    // Identity-aware inpainting: run the trained destination model with image + mask (white = repaint).
    return {
      spec: { id: ref.model, version: ref.version },
      inputs: [
        {
          prompt: input.prompt,
          image: input.imageUrl,
          mask: input.maskUrl,
          prompt_strength: 0.85,
          num_outputs: 1,
          lora_scale: 1,
          output_format: "jpg",
          output_quality: 95,
          disable_safety_checker: false,
        },
      ],
    };
  }
  const prompt = input.identity
    ? replaceTriggerPhrase(input.prompt, input.identity, `the ${input.identity.subject}`)
    : input.prompt;
  return {
    spec: R.inpaint,
    inputs: [
      {
        prompt,
        image: input.imageUrl,
        mask: input.maskUrl,
        output_format: "jpg",
        prompt_upsampling: false,
        safety_tolerance: STRICT_SAFETY_TOLERANCE,
      },
    ],
  };
}

/* ─────────────── Single-image utilities ─────────────── */

export function upscalePlan(input: UpscaleInput): PredictionPlan {
  return {
    spec: R.upscale,
    inputs: [
      {
        image: input.imageUrl,
        upscale_factor: `${input.scale}x`,
        enhance_model: "Standard V2",
        output_format: "jpg",
        face_enhancement: input.faceRestore,
        // Low creativity keeps the face on-identity.
        ...(input.faceRestore ? { face_enhancement_strength: 0.8, face_enhancement_creativity: 0 } : {}),
      },
    ],
  };
}

export function faceRestorePlan(imageUrl: string): PredictionPlan {
  return {
    spec: R.faceRestore,
    // fidelity >= 0.7 preserves identity (CodeFormer drifts at low fidelity).
    inputs: [{ image: imageUrl, codeformer_fidelity: 0.7, upscale: 2, face_upsample: true, background_enhance: true }],
  };
}

export function removeBackgroundPlan(imageUrl: string): PredictionPlan {
  return { spec: R.removeBg, inputs: [{ image: imageUrl }] };
}

export function tryOnPlan(input: TryOnInput): PredictionPlan {
  return nanoBananaPlan(
    { prompt: tryOnPrompt(input.category), image_input: [input.personImageUrl, input.garmentImageUrl] },
    undefined,
    1,
  );
}

/* ─────────────── Video / audio / text ─────────────── */

export function imageToVideoPlan(input: ImageToVideoInput): PredictionPlan {
  return {
    spec: R.imageToVideo,
    inputs: [
      {
        prompt: input.prompt.trim() || DEFAULT_MOTION_PROMPT,
        start_image: input.imageUrl,
        duration: input.durationSec,
        negative_prompt: "blurry, distorted face, deformed hands, extra limbs, flicker, low quality, text, watermark",
      },
    ],
  };
}

/** Our voice presets -> MiniMax system voice ids. Unknown values that look like a voice id pass through. */
export const VOICE_IDS: Record<string, string> = {
  warm_female: "Wise_Woman",
  bright_female: "Lively_Girl",
  calm_male: "Patient_Man",
  deep_male: "Deep_Voice_Man",
  neutral: "Friendly_Person",
};

export function voiceId(voice: string): string {
  return VOICE_IDS[voice] ?? (/^[A-Za-z0-9_]{2,64}$/.test(voice) ? voice : VOICE_IDS.neutral);
}

export function ttsInput(script: string, voice: string): Record<string, unknown> {
  return { text: script.trim(), voice_id: voiceId(voice) };
}

export function talkingAvatarPlan(imageUrl: string, audioUrl: string): PredictionPlan {
  return { spec: R.talkingVideo, inputs: [{ image: imageUrl, audio: audioUrl }] };
}

export function promptHelperInput(input: PromptHelperInput): Record<string, unknown> {
  return {
    prompt: buildPromptHelperUserMessage(input),
    system_prompt: PROMPT_HELPER_SYSTEM_PROMPT,
    reasoning_effort: "minimal",
    max_completion_tokens: 600,
  };
}

/* ─────────────── Training ─────────────── */

export function trainingInput(input: TrainingInput): Record<string, unknown> {
  return {
    input_images: input.imagesZipUrl,
    trigger_word: input.triggerWord,
    lora_type: "subject",
    ...(input.steps ? { training_steps: input.steps } : {}),
  };
}

/* ─────────────── helpers ─────────────── */

function loraFor(identity: Pick<IdentityRef, "modelRef">): string | null {
  const ref = decodeModelRef(identity.modelRef);
  return ref ? loraWeightsFor(ref) : null;
}

function withTriggerPhrase(prompt: string, identity: Pick<IdentityRef, "triggerWord" | "subject">): string {
  return prompt.toLowerCase().includes(identity.triggerWord.toLowerCase())
    ? prompt
    : `photo of ${identity.triggerWord} ${identity.subject}, ${prompt}`;
}

/** Split `count` into chunks of at most `max` (6, 4 -> [4, 2]). */
export function splitCount(count: number, max: number): number[] {
  const out: number[] = [];
  for (let left = count; left > 0; left -= max) out.push(Math.min(max, left));
  return out;
}

function repeat<T extends Record<string, unknown>>(payload: T, count: number): T[] {
  return Array.from({ length: count }, () => ({ ...payload }));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function invalid(message: string): ProviderRequestError {
  return new ProviderRequestError({ provider: "replicate", message, retryable: false });
}
