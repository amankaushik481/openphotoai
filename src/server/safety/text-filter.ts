/**
 * Always-on rule-based text classifier for prompts, edit instructions and scripts.
 * Runs before (and independently of) the configured ModerationProvider; it cannot be disabled.
 * Evasion handling lives in normalize.ts; term lists in terms.ts and public-figures.ts.
 */
import { buildVariants, compileTerms, findTerms, type CompiledTerms, type TextVariants } from "./normalize";
import { findPublicFigures } from "./public-figures";
import {
  HATE_TERMS,
  MINOR_TERMS,
  PUBLIC_FIGURE_PHRASES,
  SEXUAL_TERMS,
  TEXT_FILTER_EXCEPTIONS,
  VIOLENCE_GORE_TERMS,
} from "./terms";

export {
  HATE_TERMS,
  MINOR_TERMS,
  PUBLIC_FIGURE_PHRASES,
  SEXUAL_TERMS,
  TEXT_FILTER_EXCEPTIONS,
  VIOLENCE_GORE_TERMS,
} from "./terms";
export { PUBLIC_FIGURES, findPublicFigures } from "./public-figures";

export const TEXT_CATEGORIES = ["minors", "sexual", "public_figure", "violence_gore", "hate"] as const;
export type TextCategory = (typeof TEXT_CATEGORIES)[number];

export interface TextFilterMatch {
  category: TextCategory;
  /** The normalized text that matched (or the canonical public-figure name). */
  match: string;
}

export interface TextFilterResult {
  allowed: boolean;
  categories: TextCategory[];
  matches: TextFilterMatch[];
}

/** Ages below this in the text ("15 year old", "aged 12", "15yo") are treated as minors. */
const ADULT_AGE = 18;

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
] as const;
const NUM = `(\\d{1,3}|${NUMBER_WORDS.join("|")})`;

/** Age expressions; capture group 1 is the age. Run on normalized text with punctuation turned into spaces. */
const AGE_PATTERNS: readonly RegExp[] = [
  // "15 years old", "15-year-old", "15 yr old", "15yo", "15 y/o", "fifteen year old"
  new RegExp(`(?<![a-z0-9])${NUM}\\s*(?:years?|yrs?|y)\\s*(?:o|old)(?![a-z])`, "g"),
  // "aged 15", "age 15", "age of 15"
  new RegExp(`(?<![a-z])aged?\\s+(?:of\\s+)?${NUM}(?![a-z0-9])`, "g"),
  // "15 years of age"
  new RegExp(`(?<![a-z0-9])${NUM}\\s*(?:years?|yrs?)\\s+of\\s+age(?![a-z])`, "g"),
];
/** "under 18", "below eighteen", "under the age of 16": capture group 1 is the (exclusive) upper bound. */
const UNDER_AGE_PATTERNS: readonly RegExp[] = [
  new RegExp(`(?<![a-z])(?:under|below)\\s+the\\s+age\\s+of\\s+${NUM}(?![0-9])`, "g"),
  new RegExp(`(?<![a-z])(?:under|below)\\s+(18|eighteen)(?![0-9])`, "g"),
];

function parseAge(raw: string): number {
  const idx = (NUMBER_WORDS as readonly string[]).indexOf(raw);
  return idx >= 0 ? idx : raw === "eighteen" ? 18 : Number(raw);
}

function findMinorAges(variants: TextVariants): string[] {
  const text = variants.base.replace(/[^a-z0-9]+/g, " ");
  const found: string[] = [];
  for (const re of AGE_PATTERNS) {
    for (const m of text.matchAll(re)) if (parseAge(m[1]!) < ADULT_AGE) found.push(m[0].trim());
  }
  for (const re of UNDER_AGE_PATTERNS) {
    for (const m of text.matchAll(re)) if (parseAge(m[1]!) <= ADULT_AGE) found.push(m[0].trim());
  }
  return found;
}

type TermCategory = Exclude<TextCategory, "public_figure">;
const TERM_LISTS: Record<TermCategory, readonly string[]> = {
  minors: MINOR_TERMS,
  sexual: SEXUAL_TERMS,
  violence_gore: VIOLENCE_GORE_TERMS,
  hate: HATE_TERMS,
};

let compiledLists: { category: TextCategory; compiled: CompiledTerms }[] | null = null;
function compiled() {
  compiledLists ??= [
    ...(Object.keys(TERM_LISTS) as TermCategory[]).map((category) => ({
      category,
      compiled: compileTerms(TERM_LISTS[category]),
    })),
    { category: "public_figure" as const, compiled: compileTerms(PUBLIC_FIGURE_PHRASES) },
  ];
  return compiledLists;
}

/** Classify one piece of user text. Empty text is allowed. */
export function classifyText(text: string): TextFilterResult {
  if (!text.trim()) return { allowed: true, categories: [], matches: [] };
  const variants = buildVariants(text, TEXT_FILTER_EXCEPTIONS);
  const matches: TextFilterMatch[] = [];
  for (const { category, compiled: terms } of compiled()) {
    for (const match of findTerms(variants, terms)) matches.push({ category, match });
  }
  for (const match of findMinorAges(variants)) matches.push({ category: "minors", match });
  for (const match of findPublicFigures(text)) matches.push({ category: "public_figure", match });

  const categories = TEXT_CATEGORIES.filter((c) => matches.some((m) => m.category === c));
  return { allowed: categories.length === 0, categories, matches: dedupe(matches) };
}

/** Classify several texts (each on its own, so words never join across texts). */
export function classifyTexts(texts: readonly string[]): TextFilterResult {
  const results = texts.map(classifyText);
  const matches = dedupe(results.flatMap((r) => r.matches));
  const categories = TEXT_CATEGORIES.filter((c) => results.some((r) => r.categories.includes(c)));
  return { allowed: categories.length === 0, categories, matches };
}

function dedupe(matches: TextFilterMatch[]): TextFilterMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.category}:${m.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
