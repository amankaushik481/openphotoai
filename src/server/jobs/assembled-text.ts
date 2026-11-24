/**
 * Helpers for `JobPlan.assembledTexts`: the provider-bound text a handler builds from user text,
 * brand-kit fragments and templates, re-checked AS A WHOLE by the engine (SAF-8: a blocked phrase
 * split across fields, e.g. brand kit "sunny beach, no" + "clothes", only shows up once joined).
 *
 * Curated pack prompts and negative prompts are NOT part of it (they are static, validated in CI by
 * `pnpm packs:validate`); only the last few words of a pack prompt are kept, so a phrase spanning the
 * pack prompt / user suffix boundary is still caught.
 */

/** Words of a curated pack prompt kept in front of the user's suffix. */
const PACK_TAIL_WORDS = 4;

/** Replace identity trigger words (random tokens like "ohwxabcdef") with a neutral word. */
export function maskTriggerWords(text: string, triggerWords: readonly (string | null | undefined)[]): string {
  let out = text;
  for (const word of triggerWords) if (word) out = out.split(word).join("person");
  return out.replace(/\s+/g, " ").trim();
}

/** The last words of a curated prompt (the part that can join with user text). */
export function curatedTail(prompt: string, words = PACK_TAIL_WORDS): string {
  return prompt.trim().split(/\s+/).slice(-words).join(" ");
}

/**
 * The assembled text to re-check, or [] when nothing user-controlled was added. `curated` is a pack
 * prompt (only its tail is kept); `parts` are user text / brand kit fragments / templated text.
 */
export function assembledTexts(
  opts: { curated?: string | null; parts: readonly (string | null | undefined)[]; triggerWords: readonly (string | null | undefined)[] },
): string[] {
  const parts = opts.parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  if (parts.length === 0) return [];
  const joined = [opts.curated ? curatedTail(opts.curated) : null, ...parts].filter(Boolean).join(", ");
  return [maskTriggerWords(joined, opts.triggerWords)];
}
