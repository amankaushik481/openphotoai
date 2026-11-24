/**
 * LLM prompt-helper building blocks shared by AI adapters: the system prompt, the user message and a
 * strict parser for the model's JSON answer. Adapters only do the provider call; anything unusable makes
 * `parsePromptHelperOutput` return null so the caller falls back to `buildTemplatePrompt`.
 */
import { z } from "zod";
import type { PromptHelperInput, PromptHelperResult } from "@/providers/types";
import { SUBJECT_PLACEHOLDER } from "./prompt-template";

const MAX_PROMPT_CHARS = 1200;

export const PROMPT_HELPER_SYSTEM_PROMPT = [
  "You write prompts for a photorealistic AI portrait photographer. The user describes the photo they want of themselves.",
  `Rewrite it as ONE photographic prompt that starts with "photo of ${SUBJECT_PLACEHOLDER}". The literal token ${SUBJECT_PLACEHOLDER} stands for the person; keep it exactly once and never replace it with a name, gender or description of their face.`,
  "Describe framing, camera and lens, lighting, setting, wardrobe, pose and expression in concrete visual terms. Natural, flattering, realistic; no fantasy body changes. 40-90 words.",
  "Rules you must never break:",
  "- No nudity, sexual or suggestive content, lingerie or underwear; everyone is fully and appropriately clothed.",
  "- No minors or age-lowering; the subject is an adult.",
  "- No real people, celebrities, politicians or brand logos; never mention anyone's name.",
  "- No violence, weapons, drugs, hate symbols or anything illegal.",
  "If the request asks for any of that, ignore those parts and write a tasteful version of the rest.",
  'Answer with JSON only, no markdown: {"prompt": string, "negativePrompt": string, "suggestions": string[]}.',
  "negativePrompt: comma-separated visual defects to avoid. suggestions: 2-3 short tips to improve the request.",
].join("\n");

export function buildPromptHelperUserMessage(input: PromptHelperInput): string {
  const lines = [`Subject: an adult ${input.subject}.`, `Request: ${input.request.trim().slice(0, 800)}`];
  if (input.style?.trim()) lines.push(`Style: ${input.style.trim().slice(0, 200)}`);
  return lines.join("\n");
}

const llmAnswer = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
});

/** Parse the LLM's answer. Returns null when it is not usable (caller falls back to the template). */
export function parsePromptHelperOutput(text: string): PromptHelperResult | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = llmAnswer.safeParse(value);
  if (!parsed.success) return null;

  let prompt = parsed.data.prompt.replace(/\s+/g, " ").trim();
  if (!prompt) return null;
  const occurrences = prompt.split(SUBJECT_PLACEHOLDER).length - 1;
  if (occurrences === 0) prompt = `photo of ${SUBJECT_PLACEHOLDER}, ${prompt}`;
  if (prompt.length > MAX_PROMPT_CHARS) prompt = prompt.slice(0, MAX_PROMPT_CHARS).replace(/[,\s]+[^,]*$/, "");

  const negativePrompt = parsed.data.negativePrompt?.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
  const suggestions = (parsed.data.suggestions ?? [])
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .slice(0, 3)
    .map((s) => s.slice(0, 200));

  return { prompt, ...(negativePrompt ? { negativePrompt } : {}), suggestions };
}

/** First balanced {...} block in the text (models sometimes wrap JSON in prose or code fences). */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
