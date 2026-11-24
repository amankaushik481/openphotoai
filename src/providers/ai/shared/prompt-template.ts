/**
 * Deterministic prompt-helper fallback, shared by every AI adapter. Used when the LLM call fails, times out
 * or returns something unusable. Output keeps the identity placeholder "{subject}", which the engine later
 * replaces with the trigger phrase (e.g. "ohwx man").
 */
import type { PromptHelperInput, PromptHelperResult } from "@/providers/types";

export const SUBJECT_PLACEHOLDER = "{subject}";

export const DEFAULT_NEGATIVE_PROMPT =
  "blurry, out of focus, distorted face, asymmetric eyes, extra fingers, deformed hands, extra limbs, " +
  "cartoon, illustration, painting, 3d render, watermark, text, logo, low quality, jpeg artifacts, oversaturated";

const MAX_REQUEST_CHARS = 600;

const QUALITY_SUFFIX =
  "natural skin texture, realistic proportions, sharp focus on the eyes, shot on a full-frame camera with an 85mm lens, " +
  "shallow depth of field, high detail, photorealistic";

const LIGHTING_WORDS =
  /\b(light|lighting|lit|sun|sunset|sunrise|golden hour|blue hour|neon|studio|night|daylight|backlit|shadow|glow)\b/i;
const FRAMING_WORDS =
  /\b(portrait|headshot|close-?up|full[- ]body|half[- ]body|waist[- ]up|wide shot|selfie|profile|three-quarter)\b/i;
const OUTFIT_WORDS =
  /\b(wearing|dressed|suit|dress|shirt|jacket|blazer|coat|sweater|hoodie|t-shirt|outfit|uniform|jeans|gown|tuxedo)\b/i;

const LEADING_SELF_REFERENCE =
  /^\s*(?:(?:a|an|the)\s+)?(?:(?:photo|picture|image|shot|portrait|pic)\s+of\s+)?(?:me|myself|i am|i'm|im)\b[\s,:-]*/i;

/** Remove "me"/"a photo of me" style lead-ins and any existing placeholder; collapse whitespace. */
export function cleanUserRequest(request: string): string {
  return request
    .replaceAll(SUBJECT_PLACEHOLDER, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(LEADING_SELF_REFERENCE, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .slice(0, MAX_REQUEST_CHARS);
}

/** Deterministic, provider-independent prompt built from the user's request. */
export function buildTemplatePrompt(input: PromptHelperInput): PromptHelperResult {
  const request = cleanUserRequest(input.request);
  const style = input.style?.replace(/\s+/g, " ").trim().slice(0, 120);
  const parts = [`professional photo of ${SUBJECT_PLACEHOLDER}`];
  if (request) parts.push(request);
  if (style) parts.push(`${style} style`);
  if (!LIGHTING_WORDS.test(request)) parts.push("soft natural lighting");
  parts.push(QUALITY_SUFFIX);

  return {
    prompt: parts.join(", "),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    suggestions: templateSuggestions(request, input.subject),
  };
}

function templateSuggestions(request: string, subject: PromptHelperInput["subject"]): string[] {
  const out: string[] = [];
  if (!FRAMING_WORDS.test(request)) out.push("Say how close the shot is, e.g. \"head-and-shoulders portrait\" or \"full-body shot\".");
  if (!OUTFIT_WORDS.test(request)) {
    const example = subject === "woman" ? "a cream linen dress" : subject === "man" ? "a navy linen shirt" : "a navy blazer";
    out.push(`Describe the outfit, e.g. "wearing ${example}".`);
  }
  if (!LIGHTING_WORDS.test(request)) out.push("Pick the light, e.g. \"golden hour\", \"soft window light\" or \"studio lighting\".");
  if (out.length < 3) out.push("Add a mood or expression, e.g. \"relaxed smile\" or \"confident, looking at the camera\".");
  return out.slice(0, 3);
}
