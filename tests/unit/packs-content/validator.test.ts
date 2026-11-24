/** Unit tests for scripts/validate-packs.ts (the `pnpm packs:validate` checks). */
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPromptTemplate,
  findBannedTerms,
  loadSafetyClassifier,
  validatePack,
  validatePacksDir,
} from "../../../scripts/validate-packs";

const GOOD_PROMPT =
  "portrait of {subject} in a sunlit loft office, wearing a navy sweater, warm smile, soft window light, 50mm lens";

function makePack(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-pack",
    name: "Test Pack",
    tagline: "A pack used in tests.",
    description: "A small but valid pack used by the validator tests.",
    category: "lifestyle",
    emoji: "🧪",
    tags: ["test", "example"],
    colors: ["#111111", "#eeeeee"],
    prompts: Array.from({ length: 12 }, (_, i) => ({
      title: `Shot ${i + 1}`,
      prompt: `${GOOD_PROMPT}, variation ${i + 1}`,
    })),
    ...overrides,
  };
}

const errorsOf = <T extends { level: string }>(issues: T[]): T[] => issues.filter((i) => i.level === "error");

describe("checkPromptTemplate", () => {
  it("accepts a well-formed prompt", () => {
    expect(checkPromptTemplate(GOOD_PROMPT)).toEqual([]);
  });

  it("requires {subject} exactly once", () => {
    expect(errorsOf(checkPromptTemplate(GOOD_PROMPT.replace("{subject}", "someone")))[0]?.message).toMatch(/0 times/);
    expect(errorsOf(checkPromptTemplate(`${GOOD_PROMPT}, next to {subject}`))[0]?.message).toMatch(/2 times/);
  });

  it("rejects unknown placeholders and stray braces", () => {
    expect(errorsOf(checkPromptTemplate(`${GOOD_PROMPT}, {name} smiling`))[0]?.message).toMatch(
      /unknown placeholder \{name\}/,
    );
    expect(errorsOf(checkPromptTemplate(`${GOOD_PROMPT}, {subject`)).length).toBeGreaterThan(0);
  });

  it("flags pronoun grammar that breaks for they/their", () => {
    expect(errorsOf(checkPromptTemplate(`${GOOD_PROMPT} while {pronoun} is laughing`))[0]?.message).toMatch(/they/);
    const warn = checkPromptTemplate(`${GOOD_PROMPT} as {pronoun} smiles`);
    expect(warn.some((i) => i.level === "warning")).toBe(true);
    expect(checkPromptTemplate(`${GOOD_PROMPT} as {pronoun} turned, light on {possessive} face`)).toEqual([]);
  });

  it("enforces the minimum prompt length", () => {
    expect(errorsOf(checkPromptTemplate("photo of {subject}"))[0]?.message).toMatch(/at least/);
  });
});

describe("findBannedTerms", () => {
  it("catches sexual, minor, violent, trademark and real-person terms", () => {
    const categories = (text: string) => findBannedTerms(text).map((h) => h.category);
    expect(categories("a sexy portrait")).toContain("sexual");
    expect(categories("portrait in a bikini")).toContain("sexual");
    expect(categories("with a child")).toContain("minors");
    expect(categories("holding a sword")).toContain("violence");
    expect(categories("Vogue cover")).toContain("trademark");
    expect(categories("shot on Kodak film")).toContain("trademark");
    expect(categories("a celebrity lookalike")).toContain("real_people");
  });

  it("matches whole words only and normalizes case, accents and hyphens", () => {
    expect(findBannedTerms("warrior pose at Mount Fuji, a babysitter-free spice souk")).toEqual([]);
    expect(findBannedTerms("HERMÈS scarf").map((h) => h.term)).toContain("hermes");
    expect(findBannedTerms("spider man suit").map((h) => h.term)).toContain("spider-man");
  });

  it("treats platform names as prompt-only warnings", () => {
    const hits = findBannedTerms("LinkedIn profile photo", "prompt");
    expect(hits).toEqual([{ term: "linkedin", category: "platform", level: "warning" }]);
    expect(findBannedTerms("Perfect for LinkedIn", "metadata")).toEqual([]);
  });
});

describe("validatePack", () => {
  it("accepts a valid pack", () => {
    const { pack, issues } = validatePack("test-pack.json", makePack());
    expect(pack?.slug).toBe("test-pack");
    expect(errorsOf(issues)).toEqual([]);
  });

  it("reports schema errors with their path", () => {
    const { pack, issues } = validatePack("test-pack.json", makePack({ category: "nope" }));
    expect(pack).toBeNull();
    expect(issues[0]).toMatchObject({ level: "error", where: "category" });
  });

  it("requires the slug to match the file name", () => {
    const { issues } = validatePack("other-name.json", makePack());
    expect(errorsOf(issues).map((i) => i.where)).toContain("slug");
  });

  it("checks promptMan/promptWoman overrides, metadata and duplicates", () => {
    const prompts = makePack().prompts;
    prompts[0] = {
      ...prompts[0]!,
      promptMan: "portrait of a man in a navy suit, soft window light, 85mm lens, crisp detail",
    } as never;
    prompts[1] = { ...prompts[1]!, title: "Shot 1" };
    const { issues } = validatePack(
      "test-pack.json",
      makePack({ prompts, tagline: "Sexy {subject} shots", negativePrompt: "blurry, {subject}" }),
    );
    const messages = errorsOf(issues).map((i) => `${i.where}: ${i.message}`);
    expect(messages.some((m) => m.includes("promptMan") && m.includes("0 times"))).toBe(true);
    expect(messages.some((m) => m.startsWith("tagline") && m.includes("placeholders"))).toBe(true);
    expect(messages.some((m) => m.startsWith("tagline") && m.includes("sexy"))).toBe(true);
    expect(messages.some((m) => m.startsWith("negativePrompt"))).toBe(true);
    expect(messages.some((m) => m.includes("duplicate prompt title"))).toBe(true);
  });

  it("does not scan negative prompts for banned terms", () => {
    const { issues } = validatePack(
      "test-pack.json",
      makePack({ negativePrompt: "nudity, weapons, blood, watermark" }),
    );
    expect(errorsOf(issues)).toEqual([]);
  });

  it("runs the injected classifier on expanded prompts and metadata", () => {
    const seen: string[] = [];
    const classifier = (text: string) => {
      seen.push(text);
      return text.includes("loft") ? { allowed: false, reasons: ["test: loft"] } : { allowed: true, reasons: [] };
    };
    const { issues } = validatePack("test-pack.json", makePack(), classifier);
    expect(seen.some((t) => t.includes("sks person") && !t.includes("{subject}"))).toBe(true);
    expect(errorsOf(issues).some((i) => i.message.includes("safety text filter"))).toBe(true);
  });
});

describe("validatePacksDir", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "packs-validate-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("validates a directory and reports invalid JSON and duplicate slugs", async () => {
    await writeFile(path.join(dir, "test-pack.json"), JSON.stringify(makePack()));
    await writeFile(path.join(dir, "broken.json"), "{ not json");
    await writeFile(path.join(dir, "copy.json"), JSON.stringify(makePack()));
    const report = await validatePacksDir({ dir, classifier: null });
    expect(report.files).toBe(3);
    expect(report.packs.map((p) => p.file)).toEqual(["test-pack.json"]);
    const messages = errorsOf(report.issues).map((i) => `${i.file} ${i.where} ${i.message}`);
    expect(messages.some((m) => m.startsWith("broken.json") && m.includes("invalid JSON"))).toBe(true);
    expect(messages.some((m) => m.includes('"test-pack" must match the file name "copy"'))).toBe(true);
    expect(messages.some((m) => m.startsWith("copy.json slug duplicate slug") && m.includes("test-pack.json"))).toBe(
      true,
    );
    expect(messages.some((m) => m.startsWith("test-pack.json"))).toBe(false);
  });

  it("lists only error-free packs as valid", async () => {
    await writeFile(path.join(dir, "test-pack.json"), JSON.stringify(makePack()));
    await writeFile(
      path.join(dir, "bad-pack.json"),
      JSON.stringify(makePack({ slug: "bad-pack", name: "Sexy shots" })),
    );
    const report = await validatePacksDir({ dir, classifier: null });
    expect(report.packs.map((p) => p.file)).toEqual(["test-pack.json"]);
  });

  it("reports an empty or missing directory", async () => {
    expect(errorsOf((await validatePacksDir({ dir, classifier: null })).issues)[0]?.message).toMatch(/no pack files/);
    const missing = await validatePacksDir({ dir: path.join(dir, "nope"), classifier: null });
    expect(errorsOf(missing.issues)[0]?.message).toMatch(/cannot read/);
  });
});

describe("loadSafetyClassifier", () => {
  it("loads classifyText from the safety module when present", async () => {
    if (!existsSync(path.join(process.cwd(), "src", "server", "safety", "text-filter.ts"))) return;
    const classifier = await loadSafetyClassifier();
    expect(classifier).not.toBeNull();
    if (!classifier) return;
    expect(classifier("a warm portrait in a sunlit café").allowed).toBe(true);
    expect(classifier("a nude portrait").allowed).toBe(false);
  });

  it("returns null when the module does not exist", async () => {
    expect(await loadSafetyClassifier(os.tmpdir())).toBeNull();
  });
});
