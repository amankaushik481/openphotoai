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
  NON_LATIN_TERMS,
  PUBLIC_FIGURE_PHRASES,
  SEXUAL_TERMS,
  TEXT_FILTER_EXCEPTIONS,
  VIOLENCE_GORE_TERMS,
} from "./terms";

export {
  HATE_TERMS,
  MINOR_TERMS,
  NON_LATIN_TERMS,
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
/**
 * A number that is NOT an age: followed by a unit, a time, a count of things, or "years ago/later".
 * Applied after the age-context patterns below ("at 7 pm", "is 5 feet tall", "only 15 minutes").
 */
const NOT_AN_AGE =
  "(?!\\s*(?:\\d|mm|cm|m|km|ft|feet|foot|inch|inches|in|degrees?|deg|percent|pct|pm|am|a\\s+m|p\\s+m|h|hr|hrs|hours?|min|mins|minutes?|" +
  "sec|secs|seconds?|s|fps|x|k|mph|kph|kmh|kg|lbs?|pounds?|stor(?:y|ies)|floors?|meters?|metres?|o\\s*clock|oclock|00|15|30|45|" +
  "points?|pts|stars?|th|st|nd|rd|times|people|persons?|guests|friends|kids|days?|weeks?|months?|dollars?|euros?|usd|eur|" +
  "bucks|miles?|steps|laps|reps|percent|mp|megapixels?|sizes?|angles?|locations?|poses?|shots?|photos?|outfits?|looks|colou?rs|" +
  "years?\\s+(?:ago|later|earlier|before|after|of|experience|married|together|younger|older))(?![a-z]))";
/** Who an age is about: "{subject} at 15", "me at sixteen", "her aged 12". */
const AGE_SUBJECTS = "(?:subject|me|her|him|herself|himself|myself|yourself|themselves|them|us|woman|man|person|girl|boy|lady|guy|she|he|i|version|self)";

/** Age expressions written around a number: group 1 is the age (< 18 ⇒ minor). */
const AGE_CONTEXT_PATTERNS: readonly RegExp[] = [
  // "{subject} at 15", "me at the age of 12", "her aged 14"
  new RegExp(`(?<![a-z])${AGE_SUBJECTS}\\s+(?:at|aged|age)\\s+(?:the\\s+age\\s+of\\s+|age\\s+)?${NUM}(?![0-9])${NOT_AN_AGE}`, "g"),
  // "I'm 15", "she is 15", "when I was 12", "who is only 14"
  new RegExp(
    `(?<![a-z])(?:i\\s*m|i\\s+am|she\\s*s|she\\s+is|he\\s*s|he\\s+is|they\\s+are|who\\s+is|who\\s*s|when\\s+(?:i|she|he|they|we)\\s+(?:was|were))\\s+` +
      `(?:only\\s+|just\\s+|barely\\s+|almost\\s+|nearly\\s+|about\\s+|around\\s+)?${NUM}(?![0-9])${NOT_AN_AGE}`,
    "g",
  ),
  // "turning 15", "just turned 16", "barely 15", "almost 17", "not yet 16"
  new RegExp(`(?<![a-z])(?:turning|turned|barely|almost|nearly|not\\s+yet)\\s+${NUM}(?![0-9])${NOT_AN_AGE}`, "g"),
  // "make her look 12", "looks 14", "looking about 15", "appear 13"
  new RegExp(
    `(?<![a-z])(?:look|looks|looking|appear|appears|appearing|seem|seems)\\s+(?:like\\s+)?(?:about\\s+|around\\s+|maybe\\s+)?(?:an?\\s+)?${NUM}(?![0-9])${NOT_AN_AGE}`,
    "g",
  ),
  // "15 years young"
  new RegExp(`(?<![a-z0-9])${NUM}\\s*(?:years?|yrs?)\\s+young(?![a-z])`, "g"),
  // "girl of 12", "a boy of fifteen"
  new RegExp(`(?<![a-z])(?:girl|boy|kid|child|teen|daughter|son|lass|lad)\\s+of\\s+${NUM}(?![0-9])${NOT_AN_AGE}`, "g"),
  // Other languages: "15 años", "15 ans", "15 Jahre", "15-jährige", "15 jaar", "15 anni", "15 anos", "15 saal"
  new RegExp(`(?<![a-z0-9])${NUM}\\s*(?:anos|anyos|ans|jahre|jahren|jahrige|jahriger|jahriges|jaar|jarige|anni|saal|sal|let|lat)(?![a-z])`, "g"),
];

const GRADE_WORDS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
] as const;
/** School grades / years ("7th grader", "eighth grade", "grade 9 student", "year 10 pupil"): all minors. */
const GRADE_PATTERNS: readonly RegExp[] = [
  /(?<![a-z0-9])(?:[1-9]|1[0-2])\s*(?:st|nd|rd|th)\s*grad(?:e|es|er|ers)(?![a-z])/g,
  new RegExp(`(?<![a-z])(?:${GRADE_WORDS.join("|")})\\s*grad(?:e|es|er|ers)(?![a-z])`, "g"),
  /(?<![a-z])(?:grade|year|class)\s+(?:[1-9]|1[0-2])\s+(?:student|students|pupil|pupils|girl|girls|boy|boys|kid|kids)(?![a-z])/g,
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
  for (const re of [...AGE_PATTERNS, ...AGE_CONTEXT_PATTERNS]) {
    for (const m of text.matchAll(re)) if (parseAge(m[1]!) < ADULT_AGE) found.push(m[0].trim());
  }
  for (const re of GRADE_PATTERNS) for (const m of text.matchAll(re)) found.push(m[0].trim());
  for (const re of UNDER_AGE_PATTERNS) {
    for (const m of text.matchAll(re)) if (parseAge(m[1]!) <= ADULT_AGE) found.push(m[0].trim());
  }
  return found;
}

/* ───────────── clothing removal (edits, templates, assembled prompts) ───────────── */

const GARMENTS =
  "(?:top|tops|shirt|t\\s*shirt|blouse|tank\\s+top|bra|bikini(?:\\s+(?:top|bottoms?))?|swimsuit|swimwear|bathing\\s+suit|dress|skirt|" +
  "underwear|panties|pants|trousers|shorts|jeans|leggings|bottoms|clothes|clothing|outfit|garments?|towel|robe|bathrobe|" +
  "lingerie|bodysuit|corset|sheet|bedsheet)";
const POSSESSIVE = "(?:(?:her|his|their|the|its|any|all|of|every|remaining)\\s+){0,3}";
/** Sexualized undressing / "outfit → nothing" phrasings. Run on space-separated alphanumeric text. */
const CLOTHING_REMOVAL_PATTERNS: readonly RegExp[] = [
  // "remove the bikini top", "take off her dress", "pull down her shirt", "erase her clothing"
  new RegExp(
    `(?<![a-z])(?:remove|removes|removing|removed|take\\s+off|takes\\s+off|taking\\s+off|took\\s+off|pull\\s+off|pulls\\s+off|pulling\\s+off|` +
      `pulled\\s+off|pull\\s+down|pulls\\s+down|pulling\\s+down|pulled\\s+down|strip\\s+off|stripping\\s+off|rip\\s+off|ripping\\s+off|` +
      `tear\\s+off|tearing\\s+off|erase|erases|erasing|erased|delete|deleting|deleted|lift|lifts|lifting|lifted|drop|dropping|dropped)\\s+` +
      `${POSSESSIVE}(?:[a-z]+\\s+){0,2}?${GARMENTS}(?![a-z])`,
    "g",
  ),
  // "unzip the dress completely", "unbutton her shirt all the way"
  new RegExp(
    `(?<![a-z])(?:unzip|unzips|unzipping|unzipped|unbutton|unbuttons|unbuttoning|unbuttoned|undo|undoing|open|opens|opening)\\s+` +
      `${POSSESSIVE}(?:[a-z]+\\s+){0,2}?${GARMENTS}\\s+(?:completely|entirely|fully|all\\s+the\\s+way)(?![a-z])`,
    "g",
  ),
  // "her shirt unbuttoned all the way down", "dress unzipped completely"
  new RegExp(
    `(?<![a-z])${GARMENTS}\\s+(?:is\\s+|was\\s+)?(?:unbuttoned|unzipped|undone|open|opened|pulled\\s+down|pulled\\s+up|lifted|removed|off)\\s+` +
      `(?:completely|entirely|fully|all\\s+the\\s+way)(?![a-z])`,
    "g",
  ),
  // "with her top off", "bikini off"
  new RegExp(`(?<![a-z])(?:top|bra|bikini|bikini\\s+top|underwear|panties|dress|skirt|towel|swimsuit|shirt|robe)\\s+off(?![a-z])`, "g"),
  // "without a top", "without her bra"
  new RegExp(`(?<![a-z])without\\s+(?:a|her|his|their|any)\\s+(?:top|bra|bikini\\s+top|bikini|underwear|panties|clothes|clothing|swimsuit)(?![a-z])`, "g"),
  // "change the clothing of the woman to: nothing", "replace her clothes with nothing", "outfit: none"
  new RegExp(
    `(?<![a-z])(?:clothing|clothes|outfit|outfits|attire|garments?|wardrobe|dress|top|shirt|swimsuit|bikini)\\s+` +
      `(?:[a-z]+\\s+){0,5}?(?:to|into|with|for|by)?\\s*(?:absolutely\\s+|just\\s+|only\\s+)?` +
      `(?:nothing|none|no\\s+(?:clothes|clothing|outfit|top)|bare\\s+skin|(?:her|his|their)\\s+(?:bare\\s+)?skin|nakedness)(?![a-z])`,
    "g",
  ),
];

function findClothingRemoval(variants: TextVariants): string[] {
  const found = new Set<string>();
  for (const text of variants.bounded) {
    for (const re of CLOTHING_REMOVAL_PATTERNS) for (const m of text.matchAll(re)) found.add(m[0].trim().slice(0, 60));
  }
  return [...found];
}

/* ───────────── non-Latin scripts ───────────── */

const INVISIBLE_CHARS = new RegExp("[\\p{Cf}\\u115F\\u1160\\u3164\\uFFA0\\u2800]", "gu");

function findNonLatin(text: string): { category: "sexual" | "minors"; match: string }[] {
  const folded = text.normalize("NFKC").toLowerCase().replace(INVISIBLE_CHARS, "").replace(/\s+/g, "");
  const found: { category: "sexual" | "minors"; match: string }[] = [];
  for (const category of ["sexual", "minors"] as const) {
    for (const term of NON_LATIN_TERMS[category]) if (folded.includes(term.normalize("NFKC"))) found.push({ category, match: term });
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
  for (const match of findClothingRemoval(variants)) matches.push({ category: "sexual", match });
  matches.push(...findNonLatin(text));
  for (const match of findPublicFigures(text, TEXT_FILTER_EXCEPTIONS)) matches.push({ category: "public_figure", match });

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
