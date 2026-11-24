/**
 * Two-person prompt rendering. Pack templates are written for one subject ({subject},
 * {pronoun}, {possessive}); here they describe both people. Free-form prompts may also name the
 * second person explicitly with {subject2}.
 *
 *   {subject}     -> "<t1> man and <t2> woman"   ({subject} alone)
 *   {subject}     -> "<t1> man"                   (when {subject2} is used too)
 *   {subject2}    -> "<t2> woman"
 *   {pronoun}     -> "they"     {possessive} -> "their"
 *
 * Both trigger words always end up in the prompt: providers map each one to that person's
 * reference photos (see src/providers/ai/shared/identity-prompts.ts).
 */
import { subjectToken, type PromptIdentity } from "@/server/packs/registry";
import type { AspectRatio } from "@/types/domain";
import type { Pack } from "@/types/pack";

export type TwoPeople = readonly [PromptIdentity, PromptIdentity];

/** Words that make sense for one person but contradict a two-person scene. */
const SOLO_WORDS = /\b(?:alone|solo|by (?:himself|herself|themselves))\b/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(prompt: string, triggerWord: string): boolean {
  return new RegExp(`\\b${escapeRegExp(triggerWord)}\\b`, "i").test(prompt);
}

function tidy(prompt: string): string {
  return prompt
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}

/** "<t1> man and <t2> woman". */
export function pairToken([a, b]: TwoPeople): string {
  return `${subjectToken(a)} and ${subjectToken(b)}`;
}

/** Expand placeholders for two people (no subject token is added). */
export function expandTwoPersonPlaceholders(template: string, people: TwoPeople): string {
  const [a, b] = people;
  const first = template.includes("{subject2}") ? subjectToken(a) : pairToken(people);
  return tidy(
    template
      .replace(/\{subject2\}/g, subjectToken(b))
      .replace(/\{subject\}/g, first)
      .replace(/\{pronoun\}/g, "they")
      .replace(/\{possessive\}/g, "their")
      .replace(SOLO_WORDS, ""),
  );
}

/**
 * Render a prompt template for two people. Guarantees both trigger words are present
 * (prepends "photo of <A> and <B> together, " otherwise).
 */
export function renderTwoPersonPrompt(template: string, people: TwoPeople): string {
  const prompt = expandTwoPersonPlaceholders(template, people);
  const [a, b] = people;
  if (mentions(prompt, a.triggerWord) && mentions(prompt, b.triggerWord)) return prompt;
  return prompt ? `photo of ${pairToken(people)} together, ${prompt}` : `photo of ${pairToken(people)} together`;
}

/**
 * Render prompt `index` (mod prompt count) of a pack for two people. Subject-specific variants
 * (outfit wording) are used only when both people share that subject; otherwise the neutral prompt.
 */
export function renderTwoPersonPackPrompt(
  pack: Pack,
  index: number,
  people: TwoPeople,
): { prompt: string; aspectRatio: AspectRatio; title: string; index: number } {
  const n = pack.prompts.length;
  const i = ((Math.trunc(index) % n) + n) % n;
  const p = pack.prompts[i]!;
  const [a, b] = people;
  const shared = a.subject === b.subject ? a.subject : null;
  const template = (shared === "man" && p.promptMan) || (shared === "woman" && p.promptWoman) || p.prompt;
  return {
    prompt: renderTwoPersonPrompt(template, people),
    aspectRatio: p.aspectRatio ?? pack.defaultAspectRatio,
    title: p.title,
    index: i,
  };
}
