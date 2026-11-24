import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPackCache,
  getPack,
  listPacks,
  listPackSummaries,
  mergeNegativePrompts,
  renderFreePrompt,
  renderPackPrompt,
} from "@/server/packs/registry";
import { packSchema, type Pack } from "@/types/pack";

const tw = "ohwxabcdef";

const pack: Pack = packSchema.parse({
  slug: "test-pack",
  name: "Test Pack",
  tagline: "Tagline",
  description: "A pack used by unit tests.",
  category: "professional",
  defaultAspectRatio: "4:5",
  negativePrompt: "blurry, cartoon",
  prompts: [
    {
      title: "One",
      prompt: "headshot of {subject}, {possessive} jacket is navy and {pronoun} smiles",
      promptMan: "headshot of {subject} wearing a navy suit and tie, {pronoun} smiles",
      negativePrompt: "Cartoon, extra fingers",
      aspectRatio: "1:1",
    },
    { title: "Two", prompt: "portrait of {subject} in a sunny park with trees" },
    { title: "Three", prompt: "a calm portrait in soft window light, no subject token here" },
    { title: "Four", prompt: "portrait of {subject} at the office desk working" },
    { title: "Five", prompt: "portrait of {subject} on a city rooftop at dusk" },
    { title: "Six", prompt: "portrait of {subject} in a cozy library with books" },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPackCache();
});

describe("renderPackPrompt", () => {
  it("expands placeholders per subject", () => {
    const woman = renderPackPrompt(pack, 0, { triggerWord: tw, subject: "woman" });
    expect(woman.prompt).toBe(`headshot of ${tw} woman, her jacket is navy and she smiles`);
    const person = renderPackPrompt(pack, 0, { triggerWord: tw, subject: "person" });
    expect(person.prompt).toBe(`headshot of ${tw} person, their jacket is navy and they smiles`);
  });

  it("uses subject-specific overrides", () => {
    const man = renderPackPrompt(pack, 0, { triggerWord: tw, subject: "man" });
    expect(man.prompt).toBe(`headshot of ${tw} man wearing a navy suit and tie, he smiles`);
  });

  it("merges negative prompts without duplicates and picks the aspect ratio", () => {
    const r = renderPackPrompt(pack, 0, { triggerWord: tw, subject: "man" });
    expect(r.negativePrompt).toBe("blurry, cartoon, extra fingers");
    expect(r.aspectRatio).toBe("1:1");
    expect(r.title).toBe("One");
    expect(renderPackPrompt(pack, 1, { triggerWord: tw, subject: "man" }).aspectRatio).toBe("4:5");
  });

  it("wraps the index and always includes the trigger word", () => {
    expect(renderPackPrompt(pack, 7, { triggerWord: tw, subject: "man" }).title).toBe("Two");
    expect(renderPackPrompt(pack, -1, { triggerWord: tw, subject: "man" }).title).toBe("Six");
    const noToken = renderPackPrompt(pack, 2, { triggerWord: tw, subject: "woman" });
    expect(noToken.prompt).toBe(`photo of ${tw} woman, a calm portrait in soft window light, no subject token here`);
  });
});

describe("renderFreePrompt", () => {
  it("expands placeholders", () => {
    expect(renderFreePrompt("{subject} hiking, {possessive} backpack", { triggerWord: tw, subject: "man" })).toBe(
      `${tw} man hiking, his backpack`,
    );
  });

  it("prepends the subject when missing, but not when the trigger word is present", () => {
    expect(renderFreePrompt("on a yacht at sunset", { triggerWord: tw, subject: "woman" })).toBe(
      `photo of ${tw} woman, on a yacht at sunset`,
    );
    expect(renderFreePrompt(`close-up of ${tw} smiling`, { triggerWord: tw, subject: "woman" })).toBe(`close-up of ${tw} smiling`);
  });
});

describe("mergeNegativePrompts", () => {
  it("returns undefined when empty", () => {
    expect(mergeNegativePrompts(undefined, "", " , ")).toBeUndefined();
  });
});

describe("pack files", () => {
  it("loads and validates the seed packs", async () => {
    const packs = await listPacks();
    for (const slug of ["linkedin-headshots", "studio-portrait"]) {
      const p = await getPack(slug);
      expect(p, slug).not.toBeNull();
      expect(p!.prompts.length).toBeGreaterThanOrEqual(12);
      for (let i = 0; i < p!.prompts.length; i++) {
        for (const subject of ["man", "woman", "person"] as const) {
          const r = renderPackPrompt(p!, i, { triggerWord: tw, subject });
          expect(r.prompt).toContain(tw);
          expect(r.prompt).not.toMatch(/[{}]/);
        }
      }
    }
    expect(new Set(packs.map((p) => p.slug)).size).toBe(packs.length);
    const summaries = await listPackSummaries();
    const li = summaries.find((s) => s.slug === "linkedin-headshots")!;
    expect(li.promptCount).toBeGreaterThanOrEqual(12);
    expect(li.sampleTitles.length).toBeGreaterThan(0);
    expect(await getPack("does-not-exist")).toBeNull();
  });

  it("skips invalid files and duplicate slugs", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-packs-"));
    try {
      await fs.mkdir(path.join(dir, "packs"));
      await fs.writeFile(path.join(dir, "packs", "a.json"), JSON.stringify(pack));
      await fs.writeFile(path.join(dir, "packs", "b.json"), JSON.stringify(pack));
      await fs.writeFile(path.join(dir, "packs", "c.json"), "{ not json");
      await fs.writeFile(path.join(dir, "packs", "d.json"), JSON.stringify({ slug: "Bad Slug" }));
      vi.spyOn(process, "cwd").mockReturnValue(dir);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      clearPackCache();
      const packs = await listPacks();
      expect(packs.map((p) => p.slug)).toEqual(["test-pack"]);
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
