import { describe, expect, it } from "vitest";
import {
  classifyText,
  classifyTexts,
  HATE_TERMS,
  MINOR_TERMS,
  SEXUAL_TERMS,
  VIOLENCE_GORE_TERMS,
  type TextCategory,
} from "@/server/safety/text-filter";
import { normalizeText } from "@/server/safety/normalize";

const BLOCKED: [string, TextCategory][] = [
  // sexual: plain
  ["a sexy photo of me on the beach", "sexual"],
  ["me completely naked in the shower", "sexual"],
  ["nude portrait, artistic", "sexual"],
  ["topless at the pool", "sexual"],
  ["wearing red lingerie on a bed", "sexual"],
  ["boudoir style shoot", "sexual"],
  ["seductive pose, bedroom eyes", "sexual"],
  ["NSFW glamour shot", "sexual"],
  ["my onlyfans promo picture", "sexual"],
  ["undress her", "sexual"],
  ["a see-through dress", "sexual"],
  ["me without clothes in the forest", "sexual"],
  ["remove her clothes", "sexual"],
  ["porn star look", "sexual"],
  // sexual: evasions
  ["S E X Y photo", "sexual"],
  ["s.e.x.y photo", "sexual"],
  ["s-e-x-y outfit", "sexual"],
  ["make it s3xy", "sexual"],
  ["n@ked on the beach", "sexual"],
  ["$exy look", "sexual"],
  ["seeeexxxyyy pose", "sexual"],
  ["nuuuude", "sexual"],
  ["ＮＵＤＥ portrait", "sexual"], // fullwidth
  ["ѕеху selfie", "sexual"], // Cyrillic homoglyphs
  ["nu​de portrait", "sexual"], // zero-width space
  ["n­u­d­e photo", "sexual"], // soft hyphens
  ["nüdé beach", "sexual"], // diacritics
  ["p0rn0graphic image", "sexual"],
  ["l1ngerie set", "sexual"],
  ["𝐧𝐚𝐤𝐞𝐝 selfie", "sexual"], // math bold
  ["a photo, s e x y and hot", "sexual"],
  ["#NSFW", "sexual"],
  // minors
  ["me with a child on my lap", "minors"],
  ["photo of kids at the park", "minors"],
  ["a teenage dream aesthetic", "minors"],
  ["as a teenager at prom", "minors"],
  ["schoolgirl outfit", "minors"],
  ["a 15 year old girl", "minors"],
  ["15yo boy", "minors"],
  ["a fifteen-year-old", "minors"],
  ["aged 12", "minors"],
  ["she is 16 y/o", "minors"],
  ["holding a baby", "minors"],
  ["a toddler", "minors"],
  ["loli style", "minors"],
  ["young girl in a dress", "minors"],
  ["underage", "minors"],
  ["under 18", "minors"],
  ["t33n model", "minors"],
  ["k.i.d.s party", "minors"],
  ["preteen", "minors"],
  // public figures
  ["me shaking hands with Barack Obama", "public_figure"],
  ["selfie with Taylor Swift", "public_figure"],
  ["dressed as beyoncé on stage", "public_figure"],
  ["me as Elon Musk", "public_figure"],
  ["celebrity lookalike portrait", "public_figure"],
  ["a deepfake of my boss", "public_figure"],
  // violence / gore
  ["covered in blood with a severed head", "violence_gore"],
  ["graphic gore scene", "violence_gore"],
  ["decapitated body", "violence_gore"],
  ["self-harm photo", "violence_gore"],
  // hate
  ["wearing a nazi uniform", "hate"],
  ["swastika flag behind me", "hate"],
  ["kkk rally", "hate"],
];

const ALLOWED: string[] = [
  "professional LinkedIn headshot, navy suit, soft studio light",
  "hiking in Sussex at golden hour",
  "a walk along the Essex coast",
  "annual performance assessment portrait",
  "class photo style, smiling",
  "eating a kidney bean salad",
  "baby blue linen shirt at the beach",
  "summa cum laude graduation photo",
  "doing child's pose on a yoga mat",
  "make minor adjustments to the lighting",
  "minor retouching, keep it natural",
  "wearing a Gore-Tex jacket on a mountain",
  "grilled chicken breast on the table, me cooking",
  "a cocktail at a rooftop bar",
  "an analysis of my best angles",
  "sipping a drink in a canteen",
  "my childhood home in the background",
  "a 30 year old entrepreneur in a cafe",
  "aged 35, confident",
  "therapist office portrait",
  "shirtless on a surfboard at sunset",
  "red swimsuit at a pool party",
  "wearing a bikini on vacation",
  "cooking with lots of spices",
  "classic trumpet player on stage",
  "a skyscraper in Paris",
  "photo with a 50mm lens, 4k, f/1.8",
  "kidding around with friends",
  "sextant on a sailing boat",
  "Middlesex university campus",
  "a happy dog on the grass",
  "spring wedding, white dress",
  "",
];

describe("text filter: blocked prompts", () => {
  it.each(BLOCKED)("%s → %s", (text, category) => {
    const result = classifyText(text);
    expect(result.allowed).toBe(false);
    expect(result.categories).toContain(category);
    expect(result.matches.some((m) => m.category === category)).toBe(true);
  });
});

describe("text filter: false-positive guards", () => {
  it.each(ALLOWED)("allows %j", (text) => {
    const result = classifyText(text);
    expect(result.matches).toEqual([]);
    expect(result.allowed).toBe(true);
  });
});

describe("text filter: behavior", () => {
  it("reports every category hit, most severe first", () => {
    const result = classifyText("sexy teen");
    expect(result.categories).toEqual(["minors", "sexual"]);
  });

  it("does not treat adult ages as minors", () => {
    expect(classifyText("18 year old woman at the beach").allowed).toBe(true);
    expect(classifyText("a 17 year old").categories).toEqual(["minors"]);
    expect(classifyText("under the age of 21").allowed).toBe(true);
  });

  it("exceptions cannot hide terms joined by punctuation", () => {
    expect(classifyText("a baby, blue background").categories).toContain("minors");
  });

  it("classifies several texts independently and merges the results", () => {
    const result = classifyTexts(["studio portrait", "naked"]);
    expect(result.allowed).toBe(false);
    expect(result.categories).toEqual(["sexual"]);
    // words are never joined across texts
    expect(classifyTexts(["s e", "x y"]).allowed).toBe(true);
  });

  it("exports non-empty term lists", () => {
    for (const list of [SEXUAL_TERMS, MINOR_TERMS, VIOLENCE_GORE_TERMS, HATE_TERMS]) {
      expect(list.length).toBeGreaterThan(10);
      for (const term of list) expect(term).toBe(term.toLowerCase());
    }
  });

  it("every listed term blocks on its own", () => {
    const lists: [readonly string[], TextCategory][] = [
      [SEXUAL_TERMS, "sexual"],
      [MINOR_TERMS, "minors"],
      [VIOLENCE_GORE_TERMS, "violence_gore"],
      [HATE_TERMS, "hate"],
    ];
    for (const [list, category] of lists) {
      for (const term of list) expect(classifyText(`photo of ${term} here`).categories, term).toContain(category);
    }
  });
});

describe("text filter: ReDoS resistance", () => {
  it.each([
    ["1 ".repeat(750)],
    ["1".repeat(1500)],
    ["x".repeat(1499) + "q"],
    ["a a ".repeat(375)],
    ["li".repeat(750)],
    ["s.".repeat(750)],
    ["teee".padEnd(1499, "e") + "q"],
  ])("classifies adversarial input quickly (#%#)", (text) => {
    classifyText("warm up the compiled patterns");
    const start = performance.now();
    classifyText(text);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("still decodes 1 as l", () => {
    expect(classifyText("1ingerie").categories).toContain("sexual");
    expect(classifyText("l 0 l 1").categories).toContain("minors");
  });
});

describe("normalizeText", () => {
  it("folds case, width, diacritics, homoglyphs and invisible characters", () => {
    expect(normalizeText("ＨéLLo​ Wörld")).toBe("hello world");
    expect(normalizeText("ѕеху")).toBe("sexy");
    expect(normalizeText("🇸🇪🇽")).toBe("sex");
  });
});
