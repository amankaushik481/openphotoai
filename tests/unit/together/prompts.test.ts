import { describe, expect, it } from "vitest";
import { listPacks } from "@/server/packs/registry";
import { isTogetherPack, listTogetherPacks } from "@/server/together/packs";
import {
  expandTwoPersonPlaceholders,
  pairToken,
  renderTwoPersonPackPrompt,
  renderTwoPersonPrompt,
  type TwoPeople,
} from "@/server/together/prompts";
import type { Pack } from "@/types/pack";

const ana = { triggerWord: "ohwxana", subject: "woman" } as const;
const ben = { triggerWord: "ohwxben", subject: "man" } as const;
const cal = { triggerWord: "ohwxcal", subject: "man" } as const;
const couple: TwoPeople = [ana, ben];

const pack: Pack = {
  slug: "test-pack",
  name: "Test pack",
  tagline: "For tests",
  description: "A pack used by the two-person rendering tests.",
  category: "travel",
  tags: [],
  defaultAspectRatio: "4:5",
  featured: false,
  isNew: false,
  sortOrder: 1,
  subjects: ["man", "woman", "person"],
  prompts: [
    {
      title: "Cafe",
      prompt: "photo of {subject} at a cafe terrace, warm light",
      promptMan: "photo of {subject} at a cafe terrace wearing a navy blazer",
      promptWoman: "photo of {subject} at a cafe terrace wearing a silk scarf",
    },
    { title: "Diner", prompt: "cinematic still of {subject} alone in a diner booth, {possessive} coffee", aspectRatio: "16:9" },
    { title: "Beach", prompt: "{subject} walking on the beach at sunset, golden light" },
    { title: "Park", prompt: "{subject} in a park, {pronoun} smile at the camera" },
    { title: "Rooftop", prompt: "{subject} on a rooftop at night, city lights" },
    { title: "Museum", prompt: "{subject} in a museum hall, soft daylight" },
  ],
};

describe("two-person prompt rendering", () => {
  it("expands {subject} to both people with their trigger words and subjects", () => {
    expect(pairToken(couple)).toBe("ohwxana woman and ohwxben man");
    expect(renderTwoPersonPrompt("{subject} dancing at a wedding", couple)).toBe(
      "ohwxana woman and ohwxben man dancing at a wedding",
    );
  });

  it("uses {subject2} for the second person when present", () => {
    expect(renderTwoPersonPrompt("{subject} hugging {subject2} on a bridge", couple)).toBe(
      "ohwxana woman hugging ohwxben man on a bridge",
    );
  });

  it("prepends both people when the prompt names nobody (or only one)", () => {
    expect(renderTwoPersonPrompt("having a picnic in Paris", couple)).toBe(
      "photo of ohwxana woman and ohwxben man together, having a picnic in Paris",
    );
    const onlySecond = renderTwoPersonPrompt("me with {subject2} at the beach", couple);
    expect(onlySecond.startsWith("photo of ohwxana woman and ohwxben man together, ")).toBe(true);
    expect(renderTwoPersonPrompt("   ", couple)).toBe("photo of ohwxana woman and ohwxben man together");
  });

  it("uses plural pronouns and drops solo wording", () => {
    expect(expandTwoPersonPlaceholders("{subject} alone, {pronoun} laugh, {possessive} hands", couple)).toBe(
      "ohwxana woman and ohwxben man, they laugh, their hands",
    );
  });

  it("renders pack prompts for two (neutral wording for mixed subjects)", () => {
    const r = renderTwoPersonPackPrompt(pack, 0, couple);
    expect(r.prompt).toBe("photo of ohwxana woman and ohwxben man at a cafe terrace, warm light");
    expect(r.title).toBe("Cafe");
    expect(r.aspectRatio).toBe("4:5");
    expect(r.index).toBe(0);
  });

  it("uses the subject-specific variant when both people share the subject", () => {
    expect(renderTwoPersonPackPrompt(pack, 0, [ben, cal]).prompt).toBe(
      "photo of ohwxben man and ohwxcal man at a cafe terrace wearing a navy blazer",
    );
  });

  it("wraps the prompt index and keeps the prompt's own aspect ratio", () => {
    const r = renderTwoPersonPackPrompt(pack, 7, couple);
    expect(r.index).toBe(1);
    expect(r.aspectRatio).toBe("16:9");
    expect(r.prompt).toBe("cinematic still of ohwxana woman and ohwxben man in a diner booth, their coffee");
    expect(renderTwoPersonPackPrompt(pack, -1, couple).index).toBe(5);
  });

  it("renders every shipped pack prompt with both trigger words", async () => {
    const packs = await listPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const p of packs) {
      for (let i = 0; i < p.prompts.length; i++) {
        for (const people of [couple, [ben, cal] as const, [ana, { triggerWord: "ohwxdee", subject: "woman" }] as const]) {
          const { prompt } = renderTwoPersonPackPrompt(p, i, people);
          expect(prompt).toContain(people[0].triggerWord);
          expect(prompt).toContain(people[1].triggerWord);
          expect(prompt).not.toMatch(/\{(subject2?|pronoun|possessive)\}/);
        }
      }
    }
  });
});

describe("together packs", () => {
  it("leaves out solo headshot packs", async () => {
    expect(isTogetherPack({ category: "professional", tags: [] })).toBe(false);
    expect(isTogetherPack({ category: "creative", tags: ["Headshot"] })).toBe(false);
    expect(isTogetherPack({ category: "travel", tags: ["beach"] })).toBe(true);

    const packs = await listTogetherPacks();
    expect(packs.length).toBeGreaterThan(5);
    expect(packs.some((p) => p.category === "professional")).toBe(false);
  });
});
