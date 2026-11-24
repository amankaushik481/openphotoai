/**
 * `pnpm packs:validate` — validates every photo pack in packs/*.json.
 *
 * Checks (errors fail the run; warnings only fail with --strict):
 *   - valid JSON matching `packSchema` (src/types/pack.ts)
 *   - slug equals the file name, slugs are unique
 *   - every prompt / promptMan / promptWoman contains `{subject}` exactly once and only known placeholders
 *   - `{pronoun}` is never followed by a verb that only agrees with he/she ("{pronoun} is", "{pronoun} has")
 *   - prompt length (specific enough, within the model limit), no duplicate prompts or titles
 *   - banned terms (sexual content, minors, weapons/violence, trademarks, real people) — local list below
 *   - the safety module's always-on text classifier (src/server/safety/text-filter.ts), when present
 *
 * Negative prompts are exempt from the banned-term and classifier scans: they name what the model must avoid.
 *
 * Usage: pnpm packs:validate [--dir <packs dir>] [--strict] [--quiet]
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packSchema, type Pack } from "../src/types/pack";
import { color, errorMessage, formatTable, log } from "./lib/log";

export type IssueLevel = "error" | "warning";

export interface PackIssue {
  level: IssueLevel;
  /** File name inside the packs directory, e.g. "paris.json". */
  file: string;
  /** Where in the pack, e.g. `prompts[3] "Rainy evening" › promptMan`. Empty for file-level issues. */
  where: string;
  message: string;
}

export interface ValidatedPack {
  file: string;
  pack: Pack;
}

export interface ValidationReport {
  packs: ValidatedPack[];
  issues: PackIssue[];
  files: number;
  classifierUsed: boolean;
}

/** A text classifier compatible with `classifyText` from src/server/safety/text-filter.ts. */
export type TextClassifier = (text: string) => { allowed: boolean; reasons: string[] };

export const ALLOWED_PLACEHOLDERS = ["{subject}", "{pronoun}", "{possessive}"] as const;
/** Shorter prompts are too vague to produce a consistent pack. */
export const MIN_PROMPT_LENGTH = 80;
/** Mirrors `packPromptSchema.prompt.max`. */
export const MAX_PROMPT_LENGTH = 1200;
/** Recommended prompt count per pack (the schema allows 6–60). */
export const RECOMMENDED_MIN_PROMPTS = 12;

// ───────────────────────────── banned terms ─────────────────────────────

export type BannedCategory = "sexual" | "minors" | "violence" | "drugs" | "real_people" | "trademark" | "platform";

interface BannedList {
  category: BannedCategory;
  /** Platform names are allowed in descriptions/tags (use-case words) but not in prompts. */
  scope: "everywhere" | "prompts";
  level: IssueLevel;
  terms: readonly string[];
}

export const BANNED_LISTS: readonly BannedList[] = [
  {
    category: "sexual",
    scope: "everywhere",
    level: "error",
    terms: [
      "sexy", "sexual", "sexualized", "seductive", "seductively", "sensual", "sultry", "provocative", "erotic",
      "lingerie", "underwear", "panties", "thong", "bra", "braless", "negligee", "corset", "bikini", "swimsuit",
      "swimwear", "bathing suit", "shirtless", "topless", "bare chest", "bare-chested", "bare skin", "boudoir",
      "nude", "nudity", "naked", "nsfw", "cleavage", "see-through", "skin-tight", "low-cut", "plunging neckline",
      "miniskirt", "crop top", "cropped top", "revealing outfit", "revealing clothing", "revealing clothes",
      "revealing costume", "revealing dress", "pin-up", "playboy", "onlyfans", "fetish", "stripper", "striptease",
      "intimate", "bedroom eyes", "busty", "voluptuous", "thirst trap",
    ],
  },
  {
    category: "minors",
    scope: "everywhere",
    level: "error",
    terms: [
      "kid", "kids", "child", "children", "childhood", "childlike", "teen", "teens", "teenage", "teenager",
      "preteen", "tween", "baby", "babies", "toddler", "infant", "newborn", "minor", "minors", "underage",
      "schoolgirl", "schoolboy", "school uniform", "high school", "middle school", "elementary school", "prom",
      "girl", "girls", "boy", "boys", "daughter", "son", "loli", "youngster", "juvenile",
    ],
  },
  {
    category: "violence",
    scope: "everywhere",
    level: "error",
    terms: [
      "gun", "guns", "rifle", "pistol", "firearm", "shotgun", "revolver", "weapon", "weapons", "sword", "swords",
      "knife", "knives", "dagger", "blade", "blades", "katana", "axe", "spear", "crossbow", "bullet", "bullets",
      "ammo", "ammunition", "grenade", "bomb", "explosive", "blood", "bloody", "gore", "gory", "corpse", "kill",
      "killing", "murder", "wound", "wounded",
    ],
  },
  {
    category: "drugs",
    scope: "everywhere",
    level: "error",
    terms: ["cigarette", "cigarettes", "cigar", "cigars", "smoking", "vape", "vaping", "drugs", "cocaine", "marijuana", "weed"],
  },
  {
    category: "real_people",
    scope: "everywhere",
    level: "error",
    terms: [
      "celebrity", "celebrities", "famous", "lookalike", "look-alike", "doppelganger", "in the style of",
      "wes anderson", "kubrick", "tarantino",
    ],
  },
  {
    category: "trademark",
    scope: "everywhere",
    level: "error",
    terms: [
      // magazines
      "vogue", "gq", "forbes", "techcrunch", "harper's bazaar", "vanity fair", "esquire", "cosmopolitan",
      "rolling stone", "time magazine", "elle",
      // fashion, luxury, sportswear
      "gucci", "prada", "chanel", "louis vuitton", "hermes", "dior", "balenciaga", "burberry", "ralph lauren",
      "versace", "fendi", "rolex", "cartier", "tiffany", "nike", "adidas", "lululemon", "ray-ban", "oakley",
      "moncler", "canada goose", "levi's",
      // cars
      "ferrari", "lamborghini", "porsche", "rolls-royce", "bentley", "tesla", "mercedes", "bmw", "audi", "jeep",
      // cameras and film stocks
      "polaroid", "kodak", "portra", "ektachrome", "kodachrome", "fujifilm", "leica", "hasselblad", "nikon",
      "cinestill", "ilford", "lomography", "gopro",
      // characters, franchises, films, events
      "batman", "superman", "spider-man", "spiderman", "iron man", "captain america", "wonder woman", "avengers",
      "marvel comics", "dc comics", "star wars", "jedi", "sith", "darth vader", "harry potter", "hogwarts",
      "gandalf", "hobbit", "middle-earth", "lord of the rings", "game of thrones", "mickey mouse", "disney",
      "pixar", "pokemon", "pikachu", "barbie", "lego", "minecraft", "fortnite", "super mario", "zelda",
      "hello kitty", "blade runner", "the matrix", "james bond", "deadpool", "x-men", "ghostbusters",
      "met gala", "oscars", "academy awards", "wimbledon", "olympics", "olympic", "super bowl", "coachella",
      "burning man", "ted talk", "hollywood",
      // consumer tech and food brands
      "iphone", "ipad", "macbook", "samsung", "playstation", "xbox", "nintendo", "starbucks", "coca-cola", "pepsi",
      "red bull",
    ],
  },
  {
    category: "platform",
    scope: "prompts",
    level: "warning",
    terms: [
      "instagram", "tiktok", "youtube", "linkedin", "tinder", "snapchat", "facebook", "twitter", "twitch",
      "netflix", "spotify", "discord", "pinterest",
    ],
  },
];

/** Lowercase, strip diacritics and normalize apostrophes so "Hermès" and "harper’s" match. */
function normalizeForScan(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word pattern; spaces and hyphens inside a term match any run of spaces/hyphens. */
function termRegExp(term: string): RegExp {
  const body = term
    .split(/[\s-]+/)
    .map(escapeRegExp)
    .join("[\\s-]*");
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i");
}

const COMPILED_BANNED = BANNED_LISTS.flatMap((list) =>
  list.terms.map((term) => ({ term, re: termRegExp(term), category: list.category, scope: list.scope, level: list.level })),
);

export interface BannedHit {
  term: string;
  category: BannedCategory;
  level: IssueLevel;
}

/**
 * Banned terms found in `text`. `kind: "prompt"` also applies the prompt-only lists (platform names).
 */
export function findBannedTerms(text: string, kind: "prompt" | "metadata" = "prompt"): BannedHit[] {
  const normalized = normalizeForScan(text);
  const hits: BannedHit[] = [];
  for (const b of COMPILED_BANNED) {
    if (b.scope === "prompts" && kind !== "prompt") continue;
    if (b.re.test(normalized)) hits.push({ term: b.term, category: b.category, level: b.level });
  }
  return hits;
}

// ───────────────────────────── placeholder rules ─────────────────────────────

const PLACEHOLDER_RE = /\{[^{}]*\}/g;
const HAS_PLACEHOLDER = /\{[^{}]*\}/;
/** Verbs that only agree with he/she — "{pronoun} is" renders as "they is". */
const SINGULAR_ONLY_VERBS =
  /\{pronoun\}\s+(is|are|was|were|has|have|does|do|isn't|aren't|wasn't|weren't|hasn't|haven't|doesn't|don't)\b/i;
/** A present-tense "-s" verb after {pronoun} ("{pronoun} smiles") breaks for "they". */
const S_VERB_AFTER_PRONOUN = /\{pronoun\}\s+([a-z]+[^s\s]s)\b/i;
const SENTENCE_START_PLACEHOLDER = /(^|[.!?]\s+)\{(pronoun|possessive)\}/;

/** Placeholder / grammar problems of one prompt template. */
export function checkPromptTemplate(text: string): { level: IssueLevel; message: string }[] {
  const out: { level: IssueLevel; message: string }[] = [];
  const subjectCount = text.split("{subject}").length - 1;
  if (subjectCount !== 1) {
    out.push({ level: "error", message: `{subject} appears ${subjectCount} times (must be exactly once)` });
  }
  const unknown = [...new Set(text.match(PLACEHOLDER_RE) ?? [])].filter(
    (p) => !(ALLOWED_PLACEHOLDERS as readonly string[]).includes(p),
  );
  if (unknown.length) {
    out.push({
      level: "error",
      message: `unknown placeholder ${unknown.join(", ")} (allowed: ${ALLOWED_PLACEHOLDERS.join(", ")})`,
    });
  }
  if (/[{}]/.test(text.replace(PLACEHOLDER_RE, ""))) {
    out.push({ level: "error", message: "unbalanced { or } outside a placeholder" });
  }
  const singular = text.match(SINGULAR_ONLY_VERBS);
  if (singular) {
    out.push({
      level: "error",
      message: `"{pronoun} ${singular[1]}" breaks for "they" — rephrase (e.g. past tense, or use {possessive})`,
    });
  } else {
    const sVerb = text.match(S_VERB_AFTER_PRONOUN);
    if (sVerb) {
      out.push({
        level: "warning",
        message: `"{pronoun} ${sVerb[1]}" probably breaks for "they" — prefer past tense or {possessive}`,
      });
    }
  }
  if (SENTENCE_START_PLACEHOLDER.test(text)) {
    out.push({ level: "warning", message: "{pronoun}/{possessive} starts a sentence but expands to lowercase" });
  }
  if (text.length < MIN_PROMPT_LENGTH) {
    out.push({
      level: "error",
      message: `prompt is ${text.length} characters; write at least ${MIN_PROMPT_LENGTH} (camera, light, wardrobe, setting, mood)`,
    });
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    out.push({ level: "error", message: `prompt is ${text.length} characters (max ${MAX_PROMPT_LENGTH})` });
  }
  return out;
}

/** Expand placeholders with a neutral sample identity (what the classifier would see at render time). */
export function sampleExpand(template: string): string {
  return template
    .replace(/\{subject\}/g, "sks person")
    .replace(/\{pronoun\}/g, "they")
    .replace(/\{possessive\}/g, "their");
}

// ───────────────────────────── safety classifier ─────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Adapts whatever `classifyText` returns to `{ allowed, reasons }`; null when the shape is unknown. */
function toVerdict(result: unknown): { allowed: boolean; reasons: string[] } | null {
  if (!isRecord(result) || typeof result.allowed !== "boolean") return null;
  const reasons: string[] = [];
  if (Array.isArray(result.matches)) {
    for (const m of result.matches) {
      if (isRecord(m)) reasons.push(`${String(m.category ?? "blocked")}: "${String(m.match ?? "")}"`);
    }
  } else if (Array.isArray(result.categories)) {
    reasons.push(...result.categories.map(String));
  }
  return { allowed: result.allowed, reasons };
}

/**
 * Load the always-on text classifier from src/server/safety/text-filter.ts (export `classifyText`).
 * Returns null when the module does not exist or does not export a compatible classifier.
 */
export async function loadSafetyClassifier(root = process.cwd()): Promise<TextClassifier | null> {
  const file = path.join(root, "src", "server", "safety", "text-filter.ts");
  if (!existsSync(file)) return null;
  const mod: unknown = await import(pathToFileURL(file).href);
  const classify = isRecord(mod) ? mod.classifyText : undefined;
  if (typeof classify !== "function") return null;
  const probe = toVerdict(classify("a portrait photo"));
  if (!probe) return null;
  return (text: string) => toVerdict(classify(text)) ?? { allowed: true, reasons: [] };
}

// ───────────────────────────── pack validation ─────────────────────────────

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function promptLabel(index: number, title: unknown): string {
  return typeof title === "string" && title ? `prompts[${index}] "${title}"` : `prompts[${index}]`;
}

/**
 * Validate one parsed pack file. `raw` is the parsed JSON; returns the typed pack when it matches the schema.
 */
export function validatePack(
  file: string,
  raw: unknown,
  classifier: TextClassifier | null = null,
): { pack: Pack | null; issues: PackIssue[] } {
  const issues: PackIssue[] = [];
  const add = (level: IssueLevel, where: string, message: string) => issues.push({ level, file, where, message });

  const parsed = packSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) add("error", i.path.join(".") || "(root)", i.message);
    return { pack: null, issues };
  }
  const pack = parsed.data;

  const expectedSlug = path.basename(file, ".json");
  if (pack.slug !== expectedSlug) add("error", "slug", `slug "${pack.slug}" must match the file name "${expectedSlug}"`);

  if (pack.prompts.length < RECOMMENDED_MIN_PROMPTS) {
    add("warning", "prompts", `${pack.prompts.length} prompts; aim for ${RECOMMENDED_MIN_PROMPTS}–16 so batches stay varied`);
  }
  if (pack.colors) {
    pack.colors.forEach((c, i) => {
      if (!HEX_COLOR.test(c)) add("error", `colors[${i}]`, `"${c}" is not a hex color like #1d4ed8`);
    });
  }
  if (pack.cover && !pack.cover.startsWith("/")) add("warning", "cover", "cover should be a path under /public, e.g. /packs/<slug>.jpg");
  if (new Set(pack.tags.map((t) => t.toLowerCase())).size !== pack.tags.length) add("warning", "tags", "duplicate tags");
  if (pack.tags.some((t) => t !== t.toLowerCase())) add("warning", "tags", "tags should be lowercase");

  // Metadata: shown publicly, never expanded.
  const metadata: [string, string][] = [
    ["name", pack.name],
    ["tagline", pack.tagline],
    ["description", pack.description],
    ...pack.tags.map((t, i): [string, string] => [`tags[${i}]`, t]),
    ...pack.prompts.map((p, i): [string, string] => [`${promptLabel(i, p.title)} › title`, p.title]),
  ];
  for (const [where, text] of metadata) {
    if (HAS_PLACEHOLDER.test(text)) add("error", where, "placeholders are only expanded inside prompts");
    for (const hit of findBannedTerms(text, "metadata")) add(hit.level, where, `banned term "${hit.term}" (${hit.category})`);
    const verdict = classifier?.(text);
    if (verdict && !verdict.allowed) add("error", where, `blocked by the safety text filter (${verdict.reasons.join(", ")})`);
  }

  if (pack.negativePrompt && HAS_PLACEHOLDER.test(pack.negativePrompt)) {
    add("error", "negativePrompt", "negative prompts are not expanded; remove placeholders");
  }

  const seenTitles = new Set<string>();
  const seenPrompts = new Set<string>();
  pack.prompts.forEach((p, i) => {
    const label = promptLabel(i, p.title);
    const titleKey = p.title.trim().toLowerCase();
    if (seenTitles.has(titleKey)) add("error", label, "duplicate prompt title in this pack");
    seenTitles.add(titleKey);

    const variants: [string, string | undefined][] = [
      ["prompt", p.prompt],
      ["promptMan", p.promptMan],
      ["promptWoman", p.promptWoman],
    ];
    for (const [field, text] of variants) {
      if (text === undefined) continue;
      const where = `${label} › ${field}`;
      for (const issue of checkPromptTemplate(text)) add(issue.level, where, issue.message);
      for (const hit of findBannedTerms(text, "prompt")) add(hit.level, where, `banned term "${hit.term}" (${hit.category})`);
      const verdict = classifier?.(sampleExpand(text));
      if (verdict && !verdict.allowed) add("error", where, `blocked by the safety text filter (${verdict.reasons.join(", ")})`);
      const key = text.trim().toLowerCase();
      if (seenPrompts.has(key)) add("error", where, "duplicate prompt text in this pack");
      seenPrompts.add(key);
    }
    if (p.promptMan && !pack.subjects.includes("man")) add("warning", `${label} › promptMan`, 'unused: pack subjects exclude "man"');
    if (p.promptWoman && !pack.subjects.includes("woman")) add("warning", `${label} › promptWoman`, 'unused: pack subjects exclude "woman"');
    if (p.negativePrompt && HAS_PLACEHOLDER.test(p.negativePrompt)) {
      add("error", `${label} › negativePrompt`, "negative prompts are not expanded; remove placeholders");
    }
  });

  return { pack, issues };
}

export interface ValidateOptions {
  /** Directory holding the pack files (default: <cwd>/packs). */
  dir?: string;
  /** Classifier to run prompts through; default loads the safety text filter if present. Pass null to skip. */
  classifier?: TextClassifier | null;
}

/** Validate every `*.json` file in the packs directory. */
export async function validatePacksDir(options: ValidateOptions = {}): Promise<ValidationReport> {
  const dir = options.dir ?? path.join(process.cwd(), "packs");
  const classifier = options.classifier === undefined ? await loadSafetyClassifier() : options.classifier;
  const issues: PackIssue[] = [];
  const packs: ValidatedPack[] = [];

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    issues.push({ level: "error", file: dir, where: "", message: `cannot read packs directory: ${errorMessage(err)}` });
    return { packs, issues, files: 0, classifierUsed: classifier !== null };
  }
  if (files.length === 0) issues.push({ level: "error", file: dir, where: "", message: "no pack files found" });

  const slugs = new Map<string, string>();
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (err) {
      issues.push({ level: "error", file, where: "", message: `invalid JSON: ${errorMessage(err)}` });
      continue;
    }
    const result = validatePack(file, raw, classifier);
    issues.push(...result.issues);
    if (!result.pack) continue;
    const other = slugs.get(result.pack.slug);
    if (other) {
      issues.push({ level: "error", file, where: "slug", message: `duplicate slug "${result.pack.slug}" (also in ${other})` });
      continue;
    }
    slugs.set(result.pack.slug, file);
    packs.push({ file, pack: result.pack });
  }
  return { packs, issues, files: files.length, classifierUsed: classifier !== null };
}

// ───────────────────────────── CLI ─────────────────────────────

function parseArgs(argv: string[]): { dir?: string; strict: boolean; quiet: boolean } {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  return { dir: dir ? path.resolve(dir) : undefined, strict: argv.includes("--strict"), quiet: argv.includes("--quiet") };
}

function printIssues(issues: PackIssue[], quiet: boolean): void {
  const byFile = new Map<string, PackIssue[]>();
  for (const issue of issues) {
    if (quiet && issue.level === "warning") continue;
    byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  }
  for (const [file, list] of byFile) {
    console.log(`\n${color.bold(file)}`);
    for (const issue of list) {
      const where = issue.where ? `${color.dim(issue.where)}: ` : "";
      if (issue.level === "error") log.error(`${where}${issue.message}`);
      else log.warn(`${where}${issue.message}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log.step("Validating photo packs");
  let classifier: TextClassifier | null = null;
  try {
    classifier = await loadSafetyClassifier();
  } catch (err) {
    log.warn(`could not load the safety text filter: ${errorMessage(err)}`);
  }
  log.info(
    classifier
      ? "safety text filter: src/server/safety/text-filter.ts (classifyText)"
      : color.yellow("safety text filter not found — banned-term scan only"),
  );

  const report = await validatePacksDir({ dir: args.dir, classifier });
  const errors = report.issues.filter((i) => i.level === "error");
  const warnings = report.issues.filter((i) => i.level === "warning");
  printIssues(report.issues, args.quiet);

  const promptCount = report.packs.reduce((n, p) => n + p.pack.prompts.length, 0);
  const featured = report.packs.filter((p) => p.pack.featured).length;
  console.log(
    `\n${formatTable([
      ["files", "valid packs", "prompts", "featured", "errors", "warnings"],
      [String(report.files), String(report.packs.length), String(promptCount), String(featured), String(errors.length), String(warnings.length)],
    ])}`,
  );

  if (errors.length > 0 || (args.strict && warnings.length > 0)) {
    log.error(`pack validation failed${args.strict && errors.length === 0 ? " (--strict: warnings count as errors)" : ""}`);
    process.exit(1);
  }
  log.ok(`${report.packs.length} packs valid`);
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch((err: unknown) => {
    log.error(errorMessage(err));
    process.exit(1);
  });
}
