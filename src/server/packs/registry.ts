/**
 * Pack registry: reads + validates packs/*.json (cached). CONTRACT FILE (owner: packs workstream).
 *
 * Packs are plain JSON files (see src/types/pack.ts and docs/ADDING_PACKS.md). Invalid files are
 * skipped with a warning so one bad pack never takes the gallery down; `pnpm packs:validate`
 * reports them loudly.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AspectRatio, Subject } from "@/types/domain";
import { packSchema, type Pack, type PackSummary } from "@/types/pack";

export interface PromptIdentity {
  triggerWord: string;
  subject: Subject;
}

const SAMPLE_TITLES = 4;

let cache: Promise<Pack[]> | null = null;

/** Directory holding the pack JSON files. */
export function packsDir(): string {
  return path.join(process.cwd(), "packs");
}

async function loadPacks(): Promise<Pack[]> {
  const dir = packsDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    console.warn(`[packs] cannot read ${dir}:`, err instanceof Error ? err.message : err);
    return [];
  }

  const packs: Pack[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (err) {
      console.warn(`[packs] skipping ${file}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    const parsed = packSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      console.warn(`[packs] skipping ${file}: ${issues}`);
      continue;
    }
    if (seen.has(parsed.data.slug)) {
      console.warn(`[packs] skipping ${file}: duplicate slug "${parsed.data.slug}"`);
      continue;
    }
    seen.add(parsed.data.slug);
    packs.push(parsed.data);
  }
  return packs.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function listPacks(): Promise<Pack[]> {
  if (!cache) {
    cache = loadPacks().catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

/** Drop the cached packs (tests, or after adding pack files in a long-running process). */
export function clearPackCache(): void {
  cache = null;
}

export function toPackSummary(pack: Pack): PackSummary {
  return {
    slug: pack.slug,
    name: pack.name,
    tagline: pack.tagline,
    description: pack.description,
    category: pack.category,
    emoji: pack.emoji,
    tags: pack.tags,
    colors: pack.colors,
    cover: pack.cover,
    featured: pack.featured,
    isNew: pack.isNew,
    promptCount: pack.prompts.length,
    sampleTitles: pack.prompts.slice(0, SAMPLE_TITLES).map((p) => p.title),
  };
}

export async function listPackSummaries(): Promise<PackSummary[]> {
  return (await listPacks()).map(toPackSummary);
}

export async function getPack(slug: string): Promise<Pack | null> {
  return (await listPacks()).find((p) => p.slug === slug) ?? null;
}

const PRONOUNS: Record<Subject, { pronoun: string; possessive: string; noun: string }> = {
  man: { pronoun: "he", possessive: "his", noun: "man" },
  woman: { pronoun: "she", possessive: "her", noun: "woman" },
  person: { pronoun: "they", possessive: "their", noun: "person" },
};

/** "<triggerWord> man" | "<triggerWord> woman" | "<triggerWord> person". */
export function subjectToken(identity: PromptIdentity): string {
  return `${identity.triggerWord} ${PRONOUNS[identity.subject].noun}`;
}

/** Expand {subject}/{pronoun}/{possessive} (no subject token is added). */
export function expandPlaceholders(template: string, identity: PromptIdentity): string {
  const words = PRONOUNS[identity.subject];
  return template
    .replace(/\{subject\}/g, subjectToken(identity))
    .replace(/\{pronoun\}/g, words.pronoun)
    .replace(/\{possessive\}/g, words.possessive)
    .replace(/\s+/g, " ")
    .trim();
}

/** Guarantee the identity token is in the prompt (otherwise the LoRA never activates). */
function ensureSubject(prompt: string, identity: PromptIdentity): string {
  if (prompt.includes(identity.triggerWord)) return prompt;
  return `photo of ${subjectToken(identity)}, ${prompt}`;
}

/** Merge comma-separated negative prompts, dropping empty + duplicate terms. */
export function mergeNegativePrompts(...parts: (string | undefined | null)[]): string | undefined {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of parts) {
    for (const term of (part ?? "").split(",")) {
      const t = term.trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        terms.push(t);
      }
    }
  }
  return terms.length ? terms.join(", ") : undefined;
}

/**
 * Expand prompt `index` (mod prompt count) of a pack for an identity.
 * Returns the final prompt (containing the trigger word) + negative prompt + aspect ratio.
 */
export function renderPackPrompt(
  pack: Pack,
  index: number,
  identity: { triggerWord: string; subject: Subject },
): { prompt: string; negativePrompt?: string; aspectRatio: AspectRatio; title: string } {
  const n = pack.prompts.length;
  const p = pack.prompts[((Math.trunc(index) % n) + n) % n]!;
  const template =
    (identity.subject === "man" && p.promptMan) || (identity.subject === "woman" && p.promptWoman) || p.prompt;
  return {
    prompt: ensureSubject(expandPlaceholders(template, identity), identity),
    negativePrompt: mergeNegativePrompts(pack.negativePrompt, p.negativePrompt),
    aspectRatio: p.aspectRatio ?? pack.defaultAspectRatio,
    title: p.title,
  };
}

/** Expand placeholders in a free-form user prompt; prepends the subject token if missing. */
export function renderFreePrompt(prompt: string, identity: { triggerWord: string; subject: Subject }): string {
  return ensureSubject(expandPlaceholders(prompt, identity), identity);
}
