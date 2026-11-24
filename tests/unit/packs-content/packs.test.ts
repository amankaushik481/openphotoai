/**
 * Content checks for every pack in packs/*.json: schema, counts, placeholders, banned words,
 * the safety text filter, and that every prompt renders cleanly for each subject.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderPackPrompt } from "@/server/packs/registry";
import type { Subject } from "@/types/domain";
import { PACK_CATEGORIES, packSchema, type Pack } from "@/types/pack";
import {
  ALLOWED_PLACEHOLDERS,
  checkPromptTemplate,
  findBannedTerms,
  loadSafetyClassifier,
  sampleExpand,
  type TextClassifier,
} from "../../../scripts/validate-packs";

const PACKS_DIR = path.join(process.cwd(), "packs");
const files = readdirSync(PACKS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const packs: { file: string; pack: Pack }[] = files.map((file) => ({
  file,
  pack: packSchema.parse(JSON.parse(readFileSync(path.join(PACKS_DIR, file), "utf8"))),
}));

/** Every positive prompt variant of every pack, labelled for readable failures. */
const promptVariants = packs.flatMap(({ pack }) =>
  pack.prompts.flatMap((p, i) =>
    (["prompt", "promptMan", "promptWoman"] as const)
      .filter((field) => p[field] !== undefined)
      .map((field) => ({ label: `${pack.slug} #${i} "${p.title}" ${field}`, text: p[field]! })),
  ),
);

/** Text shown publicly as-is (never expanded). */
const metadataTexts = packs.flatMap(({ pack }) => [
  { label: `${pack.slug} name`, text: pack.name },
  { label: `${pack.slug} tagline`, text: pack.tagline },
  { label: `${pack.slug} description`, text: pack.description },
  ...pack.tags.map((t) => ({ label: `${pack.slug} tag`, text: t })),
  ...pack.prompts.map((p) => ({ label: `${pack.slug} title`, text: p.title })),
]);

describe("pack catalogue", () => {
  it("every pack file parses with packSchema", () => {
    for (const file of files) {
      const result = packSchema.safeParse(JSON.parse(readFileSync(path.join(PACKS_DIR, file), "utf8")));
      expect(result.success, `${file}: ${result.error?.message ?? ""}`).toBe(true);
    }
  });

  it("ships at least 46 packs with 12+ prompts each", () => {
    expect(packs.length).toBeGreaterThanOrEqual(46);
    for (const { pack } of packs) {
      expect(pack.prompts.length, pack.slug).toBeGreaterThanOrEqual(12);
      expect(pack.prompts.length, pack.slug).toBeLessThanOrEqual(60);
    }
  });

  it("uses the file name as a unique slug", () => {
    for (const { file, pack } of packs) expect(pack.slug).toBe(path.basename(file, ".json"));
    expect(new Set(packs.map((p) => p.pack.slug)).size).toBe(packs.length);
  });

  it("covers every main category and the key themes", () => {
    const categories = new Set(packs.map((p) => p.pack.category));
    for (const c of PACK_CATEGORIES.filter((c) => c !== "family")) expect(categories, c).toContain(c);
    const slugs = new Set(packs.map((p) => p.pack.slug));
    for (const slug of [
      "business-casual", "executive-portraits", "dating-natural", "old-money", "quiet-luxury", "paris", "tokyo",
      "fitness-athleisure", "black-and-white", "diwali", "christmas-holiday", "halloween-costumes", "wedding-guest",
      "graduation", "cinematic-still", "magazine-cover", "with-my-dog", "beach-resort",
    ]) {
      expect(slugs, slug).toContain(slug);
    }
  });

  it("gives every pack card what it needs (emoji, gradient, tags) and keeps highlights curated", () => {
    for (const { pack } of packs) {
      expect(pack.emoji, pack.slug).toBeTruthy();
      expect(pack.colors, pack.slug).toBeDefined();
      for (const c of pack.colors ?? []) expect(c, pack.slug).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
      expect(pack.tags.length, pack.slug).toBeGreaterThanOrEqual(4);
    }
    const featured = packs.filter((p) => p.pack.featured).length;
    const fresh = packs.filter((p) => p.pack.isNew).length;
    expect(featured).toBeGreaterThanOrEqual(6);
    expect(featured).toBeLessThanOrEqual(12);
    expect(fresh).toBeGreaterThanOrEqual(4);
    expect(fresh).toBeLessThanOrEqual(10);
  });

  it("has no duplicate prompt titles or prompt texts within a pack", () => {
    for (const { pack } of packs) {
      const titles = pack.prompts.map((p) => p.title.toLowerCase());
      expect(new Set(titles).size, pack.slug).toBe(titles.length);
      const texts = pack.prompts.map((p) => p.prompt.toLowerCase());
      expect(new Set(texts).size, pack.slug).toBe(texts.length);
    }
  });
});

describe("placeholders", () => {
  it("every prompt variant contains {subject} exactly once and only known placeholders", () => {
    for (const { label, text } of promptVariants) {
      expect(text.split("{subject}").length - 1, label).toBe(1);
      const placeholders = text.match(/\{[^{}]*\}/g) ?? [];
      for (const p of placeholders) expect(ALLOWED_PLACEHOLDERS as readonly string[], label).toContain(p);
    }
  });

  it("passes the validator's template checks without errors", () => {
    for (const { label, text } of promptVariants) {
      const errors = checkPromptTemplate(text).filter((i) => i.level === "error");
      expect(errors, label).toEqual([]);
    }
  });

  it("keeps placeholders out of metadata and negative prompts (they are never expanded)", () => {
    for (const { label, text } of metadataTexts) expect(text, label).not.toMatch(/[{}]/);
    for (const { pack } of packs) {
      expect(pack.negativePrompt ?? "", pack.slug).not.toMatch(/[{}]/);
      for (const p of pack.prompts) expect(p.negativePrompt ?? "", `${pack.slug} ${p.title}`).not.toMatch(/[{}]/);
    }
  });

  it("renders every prompt for man, woman and person with the trigger word and no leftovers", () => {
    const subjects: Subject[] = ["man", "woman", "person"];
    for (const { pack } of packs) {
      for (let i = 0; i < pack.prompts.length; i++) {
        for (const subject of subjects) {
          const out = renderPackPrompt(pack, i, { triggerWord: "ohwx", subject });
          const label = `${pack.slug} #${i} (${subject})`;
          expect(out.prompt.split("ohwx").length - 1, label).toBe(1);
          expect(out.prompt, label).not.toMatch(/[{}]/);
          expect(out.prompt.length, label).toBeLessThanOrEqual(1200);
          expect(out.aspectRatio, label).toBeTruthy();
        }
      }
    }
  });
});

describe("content rules", () => {
  it("prompts contain no banned terms (sexual, minors, violence, trademarks, real people)", () => {
    for (const { label, text } of promptVariants) {
      const hits = findBannedTerms(text, "prompt").filter((h) => h.level === "error");
      expect(hits.map((h) => `${h.term} (${h.category})`), label).toEqual([]);
    }
  });

  it("names, taglines, descriptions, tags and titles contain no banned terms", () => {
    for (const { label, text } of metadataTexts) {
      const hits = findBannedTerms(text, "metadata").filter((h) => h.level === "error");
      expect(hits.map((h) => `${h.term} (${h.category})`), label).toEqual([]);
    }
  });

  describe("safety text filter", () => {
    let classifier: TextClassifier | null = null;
    beforeAll(async () => {
      classifier = await loadSafetyClassifier();
    });

    it("allows every prompt and every piece of pack metadata", (ctx) => {
      if (!classifier) ctx.skip();
      const blocked: string[] = [];
      for (const { label, text } of promptVariants) {
        const verdict = classifier!(sampleExpand(text));
        if (!verdict.allowed) blocked.push(`${label}: ${verdict.reasons.join(", ")}`);
      }
      for (const { label, text } of metadataTexts) {
        const verdict = classifier!(text);
        if (!verdict.allowed) blocked.push(`${label}: ${verdict.reasons.join(", ")}`);
      }
      expect(blocked).toEqual([]);
    });
  });
});
