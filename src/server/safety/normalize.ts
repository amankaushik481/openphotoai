/**
 * Text normalization for the always-on rule-based filter. Defeats the usual evasions:
 *   - case and Unicode look-alikes: NFKD (fullwidth, math alphanumerics, circled letters...),
 *     diacritics stripped, Cyrillic/Greek/small-caps homoglyphs mapped to Latin;
 *   - invisible characters (zero-width spaces/joiners, BOM, soft hyphen, bidi/tag controls);
 *   - leetspeak (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s);
 *   - separators inside words ("s.e.x", "s-e-x-y") and spaced-out letters ("s e x");
 *   - repeated letters ("seeexxxy") — handled by the patterns from `termPattern`.
 */

const MARKS = new RegExp("\\p{M}+", "gu");
/** Format controls (zero-width, BOM, soft hyphen, bidi, tags) + invisible fillers. */
const INVISIBLE = new RegExp("[\\p{Cf}\\u115F\\u1160\\u3164\\uFFA0\\u2800]", "gu");
const WHITESPACE = /\s+/g;
const NON_ALNUM = /[^a-z0-9]+/g;
/** Punctuation between two alphanumerics with no whitespace: "s.e.x", "nu-de", "se_xy". */
const INTRA_WORD_PUNCT = new RegExp("(?<=[a-z0-9])[^a-z0-9\\s]+(?=[a-z0-9])", "g");

const HOMOGLYPHS: Readonly<Record<string, string>> = {
  // Cyrillic
  "а": "a", "в": "b", "с": "c", "е": "e", "ё": "e", "һ": "h", "н": "h", "і": "i", "ї": "i", "ј": "j",
  "к": "k", "м": "m", "п": "n", "о": "o", "р": "p", "ԛ": "q", "г": "r", "ѕ": "s", "т": "t", "у": "y",
  "ү": "y", "х": "x", "ԝ": "w", "ь": "b",
  // Greek
  "α": "a", "β": "b", "γ": "y", "ε": "e", "η": "n", "ι": "i", "κ": "k", "μ": "u", "ν": "v", "ο": "o",
  "ρ": "p", "σ": "o", "ς": "s", "τ": "t", "υ": "u", "χ": "x", "ω": "w",
  // Latin letters without a decomposition + small capitals
  "ı": "i", "ȷ": "j", "ł": "l", "ø": "o", "đ": "d", "ð": "d", "ħ": "h", "ŧ": "t", "ß": "ss", "æ": "ae",
  "œ": "oe", "þ": "th", "ɑ": "a", "ɡ": "g", "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ғ": "f",
  "ɢ": "g", "ʜ": "h", "ɪ": "i", "ᴊ": "j", "ᴋ": "k", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴏ": "o", "ᴘ": "p",
  "ʀ": "r", "ꜱ": "s", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "ʏ": "y", "ᴢ": "z",
};

const LEET: Readonly<Record<string, string>> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};
const LEET_CHARS = /[013457@$]/g;
/** A token is leet-decoded only when it contains a letter or leet symbol, so plain numbers ("15") stay numbers. */
const LEET_TOKEN = /[a-z@$]/;
const REGIONAL_INDICATOR_A = 0x1f1e6;
const REGIONAL_INDICATOR_Z = 0x1f1ff;

function mapChar(ch: string): string {
  const mapped = HOMOGLYPHS[ch];
  if (mapped !== undefined) return mapped;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= REGIONAL_INDICATOR_A && cp <= REGIONAL_INDICATOR_Z) return String.fromCharCode(97 + cp - REGIONAL_INDICATOR_A);
  return ch;
}

/** Lowercase, Unicode-folded, invisible-free text with single spaces. Digits and punctuation are kept. */
export function normalizeText(text: string): string {
  const folded = text.normalize("NFKD").toLowerCase().normalize("NFKD").replace(MARKS, "").replace(INVISIBLE, "");
  return Array.from(folded, mapChar).join("").replace(WHITESPACE, " ").trim();
}

/** Decode leetspeak in every whitespace-separated token that contains a letter or leet symbol. */
export function leetify(text: string): string {
  return text.replace(/\S+/g, (token) => (LEET_TOKEN.test(token) ? decodeLeet(token) : token));
}

function decodeLeet(s: string): string {
  return s.replace(LEET_CHARS, (c) => LEET[c] ?? c);
}

function words(s: string): string {
  return s.replace(NON_ALNUM, " ").trim();
}

/**
 * Runs of >= 3 single-character tokens ("s e x", "s.e.x", "s 3 x") joined and leet-decoded.
 * Terms are searched inside these without word boundaries.
 */
function singleCharRuns(base: string): string[] {
  const tokens = base.split(/[^a-z0-9@$]+/).filter(Boolean);
  const runs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length >= 3) runs.push(decodeLeet(current.join("")));
    current = [];
  };
  for (const token of tokens) {
    if (token.length === 1) current.push(token);
    else flush();
  }
  flush();
  return runs;
}

export interface TextVariants {
  /** Normalized text with digits and punctuation intact (used for age patterns). */
  base: string;
  /** Space-separated alphanumeric variants matched with word boundaries. */
  bounded: string[];
  /** Collapsed spaced-out letter runs, matched without word boundaries. */
  runs: string[];
}

/**
 * All views of `text` the filter matches against. `exceptions` (known-safe phrases such as
 * "baby blue") are blanked out before any variant is built.
 */
export function buildVariants(text: string, exceptions: readonly RegExp[] = []): TextVariants {
  let base = normalizeText(text);
  for (const re of exceptions) base = base.replace(re, " ");
  const leet = leetify(base);
  const bounded = [...new Set([words(base), words(leet), words(leet.replace(INTRA_WORD_PUNCT, ""))])].filter(Boolean);
  return { base, bounded, runs: singleCharRuns(base) };
}

/** Normalized key used to look up names/terms after a match (letters + digits, repeats squeezed). */
export function matchKey(s: string): string {
  return leetify(normalizeText(s)).replace(NON_ALNUM, "").replace(/(.)\1+/g, "$1");
}

/**
 * Regex source for a term or name. Normalized like the text; every letter may repeat ("sexxxy"),
 * "l" also matches "i" (since "1" decodes to "i"), and words may be joined or space-separated.
 */
export function termPattern(term: string): string {
  const norm = words(leetify(normalizeText(term)));
  return norm
    .split(" ")
    .map((word) => {
      const isNumber = /^[0-9]+$/.test(word);
      return Array.from(word, (ch) => (isNumber ? ch : ch === "l" ? "[li]+" : `${ch}+`)).join("");
    })
    .join("\\s*");
}

export interface CompiledTerms {
  bounded: RegExp;
  unbounded: RegExp;
}

/**
 * Compile a term list into one boundary-aware regex and one for letter runs. A trailing "s" is
 * allowed (plurals/possessives); "-es" plurals are listed explicitly ("spic" must not match "spices").
 */
export function compileTerms(terms: readonly string[]): CompiledTerms {
  const sources = [...new Set(terms.map(termPattern).filter(Boolean))].sort((a, b) => b.length - a.length);
  const alternation = sources.join("|");
  return {
    bounded: new RegExp(`(?<![a-z])(?:${alternation})s?(?![a-z])`, "g"),
    unbounded: new RegExp(`(?:${alternation})`, "g"),
  };
}

/** Every distinct match of the compiled terms across all variants. */
export function findTerms(variants: TextVariants, compiled: CompiledTerms): string[] {
  const found = new Set<string>();
  for (const v of variants.bounded) for (const m of v.matchAll(compiled.bounded)) found.add(m[0].trim());
  for (const run of variants.runs) for (const m of run.matchAll(compiled.unbounded)) found.add(m[0]);
  return [...found];
}
