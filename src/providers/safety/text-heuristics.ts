/**
 * Light, high-precision text heuristics used by the local moderation provider.
 *
 * The authoritative prompt filter lives in src/server/safety and always runs; this layer only
 * catches unambiguous sexual phrasing (and its combination with minors) so the local provider
 * is not a pure pass-through. It deliberately avoids ambiguous fashion words ("nude lipstick",
 * "nude heels") to keep false positives near zero.
 */

export interface TextHeuristicResult {
  allowed: boolean;
  categories: string[];
  matches: string[];
}

/** Unambiguously sexual terms (word-boundary matched, case-insensitive). */
const SEXUAL_TERMS = [
  "porn",
  "porno",
  "pornographic",
  "pornography",
  "nsfw",
  "hentai",
  "xxx",
  "nudes",
  "naked",
  "topless",
  "bottomless",
  "genitals?",
  "nipples?",
  "erotic",
  "erotica",
  "fetish",
  "bdsm",
  "sex scene",
  "sex act",
  "having sex",
  "sexual intercourse",
  "intercourse",
  "blowjob",
  "handjob",
  "orgasm",
  "masturbat\\w*",
  "onlyfans",
  "strip ?tease",
  "lewd",
  "explicit sex\\w*",
  "sexually explicit",
];

/**
 * "nude" is sexual unless used as a colour/makeup/fashion tone ("nude lipstick", "nude heels").
 */
const NUDE_SEXUAL = /\bnude\b(?!\s+(?:colou?r(?:ed)?|tones?|shades?|palette|beige|lips?(?:tick|stick)?|lip|makeup|make-up|nails?|polish|heels?|pumps?|shoes?|sandals?|dress|gown|top|blouse|bra|swimsuit|look|eyeshadow|blush|gloss|manicure|pedicure|tights|stockings?|background|wall|backdrop))/i;

/** Suggestive (not explicit) words: only blocked when combined with minors. */
const SUGGESTIVE_TERMS = [
  "sexy",
  "seductive",
  "sensual",
  "provocative",
  "lingerie",
  "underwear",
  "bikini",
  "swimsuit",
  "revealing",
  "sultry",
  "skimpy",
];

/** Always-forbidden child sexual abuse terms. */
const CSAM_TERMS = ["loli", "lolicon", "shota", "shotacon", "jailbait", "pedo\\w*", "cp porn", "child porn\\w*"];

/** Words that indicate a minor; only block when combined with sexual terms. */
const MINOR_TERMS = [
  "child",
  "children",
  "kid",
  "kids",
  "minor",
  "minors",
  "underage",
  "under-age",
  "teen",
  "teens",
  "teenage",
  "teenager",
  "preteen",
  "pre-teen",
  "schoolgirl",
  "schoolboy",
  "little girl",
  "little boy",
  "young girl",
  "young boy",
  "toddler",
  "infant",
  "\\d{1,2} ?(?:yo|y/o|years? old|year-old)",
];

const wordRe = (terms: string[]) => new RegExp(`\\b(?:${terms.join("|")})\\b`, "gi");
const SEXUAL_RE = wordRe(SEXUAL_TERMS);
const SUGGESTIVE_RE = wordRe(SUGGESTIVE_TERMS);
const CSAM_RE = wordRe(CSAM_TERMS);
const MINOR_RE = wordRe(MINOR_TERMS);
const AGE_RE = /\b(\d{1,2}) ?(?:yo|y\/o|years? old|year-old)\b/gi;

function collect(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  return Array.from(text.matchAll(re), (m) => m[0].toLowerCase());
}

/** Lowercase, strip zero-width chars, collapse leetspeak separators ("p.o.r.n", "p-o-r-n"). */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/\b(?:\w[.\-_*]){2,}\w\b/g, (m) => m.replace(/[.\-_*]/g, ""))
    .toLowerCase();
}

export function evaluateTextHeuristics(text: string): TextHeuristicResult {
  const t = normalizeText(text);
  const sexual = collect(SEXUAL_RE, t);
  const nude = NUDE_SEXUAL.exec(t);
  if (nude) sexual.push(nude[0].toLowerCase());
  const csam = collect(CSAM_RE, t);
  // Ages ≥ 18 written as "25 years old" are not minors.
  const minors = collect(MINOR_RE, t).filter((m) => {
    AGE_RE.lastIndex = 0;
    const age = AGE_RE.exec(m);
    return !age || Number(age[1]) < 18;
  });

  const suggestive = minors.length > 0 ? collect(SUGGESTIVE_RE, t) : [];

  if (csam.length > 0 || (minors.length > 0 && (sexual.length > 0 || suggestive.length > 0))) {
    return { allowed: false, categories: ["sexual", "minors"], matches: [...csam, ...sexual, ...suggestive, ...minors] };
  }
  if (sexual.length > 0) return { allowed: false, categories: ["sexual"], matches: sexual };
  return { allowed: true, categories: [], matches: [] };
}
