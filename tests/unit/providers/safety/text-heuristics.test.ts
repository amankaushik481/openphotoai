import { describe, expect, it } from "vitest";
import { evaluateTextHeuristics, normalizeText } from "@/providers/safety/text-heuristics";

describe("evaluateTextHeuristics", () => {
  it.each([
    "professional LinkedIn headshot, soft light",
    "wearing nude lipstick and nude heels at a gala",
    "a nude colour silk dress on a rooftop",
    "kids birthday party photographer portrait of me",
    "me at 25 years old hiking in the alps",
    "beach vacation in a swimsuit",
    "teen movie poster style, me as the coach",
    "sexy red sports car in the background",
  ])("allows benign prompt: %s", (text) => {
    expect(evaluateTextHeuristics(text)).toEqual({ allowed: true, categories: [], matches: [] });
  });

  it.each([
    ["naked on a bed", ["sexual"]],
    ["NSFW photoshoot", ["sexual"]],
    ["p.o.r.n style", ["sexual"]],
    ["topless at the beach", ["sexual"]],
    ["fully nude portrait", ["sexual"]],
    ["sexy schoolgirl outfit", ["sexual", "minors"]],
    ["16 year old in lingerie", ["sexual", "minors"]],
    ["naked teen", ["sexual", "minors"]],
    ["loli art", ["sexual", "minors"]],
  ])("blocks %s", (text, categories) => {
    const r = evaluateTextHeuristics(text);
    expect(r.allowed).toBe(false);
    expect(r.categories).toEqual(categories);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

describe("normalizeText", () => {
  it("collapses separators and zero-width characters", () => {
    expect(normalizeText("N.S.F.W")).toBe("nsfw");
    expect(normalizeText("na​ked")).toBe("naked");
  });
});
