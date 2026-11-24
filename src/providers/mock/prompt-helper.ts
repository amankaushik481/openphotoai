/**
 * Deterministic, template-based prompt helper for the mock provider (and a usable offline
 * fallback): rewrites a plain-language request into a photography prompt with lens,
 * lighting and composition details, plus three alternative prompts.
 */
import type { PromptHelperInput, PromptHelperResult } from "../types";
import { hash32 } from "./random";

const LENSES = [
  "shot on an 85mm portrait lens at f/1.8",
  "shot on a 50mm prime lens at f/2",
  "shot on a 35mm lens at f/2.8",
  "shot on a 105mm lens at f/2.2",
];
const LIGHTING = [
  "soft golden-hour sunlight",
  "soft diffused window light",
  "cinematic rim lighting",
  "bright overcast daylight",
  "warm sunset backlight",
];
const COMPOSITION = [
  "rule-of-thirds composition",
  "centered portrait framing",
  "waist-up framing with negative space",
  "candid three-quarter angle",
];
const FINISH = "shallow depth of field, natural skin texture, sharp focus on the eyes, high detail";
const NEGATIVE = "blurry, low quality, distorted face, extra fingers, deformed hands, watermark, text, oversaturated";

export function mockPromptHelper(input: PromptHelperInput): PromptHelperResult {
  const request = input.request.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  const subject = `a ${input.subject}`;
  const scene = /\b(me|myself)\b/i.test(request)
    ? request.replace(/\b(me|myself)\b/i, subject)
    : `${subject}, ${request.charAt(0).toLowerCase()}${request.slice(1)}`;
  const style = input.style?.trim() ? `, ${input.style.trim()} style` : "";
  const h = hash32(`${request}|${input.subject}|${input.style ?? ""}`);

  const build = (variant: number) =>
    `professional photo of ${scene}${style}, ${pick(LENSES, h, variant)}, ${pick(LIGHTING, h >>> 3, variant)}, ` +
    `${pick(COMPOSITION, h >>> 6, variant)}, ${FINISH}`;

  return {
    prompt: build(0),
    negativePrompt: NEGATIVE,
    suggestions: [1, 2, 3].map(build),
  };
}

function pick<T>(list: readonly T[], seed: number, offset: number): T {
  return list[(seed + offset) % list.length];
}
