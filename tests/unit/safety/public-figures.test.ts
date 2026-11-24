import { describe, expect, it } from "vitest";
import { findPublicFigures, PUBLIC_FIGURES } from "@/server/safety/public-figures";
import { classifyText } from "@/server/safety/text-filter";

describe("public figure list", () => {
  it("has at least 300 distinct figures", () => {
    const names = new Set(PUBLIC_FIGURES.map((f) => f.name.toLowerCase()));
    expect(names.size).toBe(PUBLIC_FIGURES.length);
    expect(PUBLIC_FIGURES.length).toBeGreaterThanOrEqual(300);
  });

  it("matches every listed name and alias in a prompt", () => {
    for (const figure of PUBLIC_FIGURES) {
      for (const label of [figure.name, ...figure.aliases]) {
        expect(findPublicFigures(`portrait of me next to ${label} at a gala`), label).toContain(figure.name);
      }
    }
  });
});

describe("findPublicFigures", () => {
  it.each([
    ["me with barack obama", "Barack Obama"],
    ["Obama's inauguration", "Barack Obama"],
    ["dressed like Beyoncé", "Beyonce"],
    ["dressed like beyonce", "Beyonce"],
    ["0bama style speech", "Barack Obama"],
    ["T A Y L O R S W I F T concert", "Taylor Swift"],
    ["TAYLOR   SWIFT", "Taylor Swift"],
    ["taylor-swift tour poster", "Taylor Swift"],
    ["#ElonMusk", "Elon Musk"],
    ["Jay-Z at the Grammys", "Jay-Z"],
    ["kim jong-un parade", "Kim Jong Un"],
    ["zelenskyy speech", "Volodymyr Zelensky"],
    ["Rihanna", "Rihanna"],
    ["me and Kylian Mbappé", "Kylian Mbappe"],
    ["Lupita Nyong'o red carpet", "Lupita Nyong'o"],
    ["meeting the Pope Leo", "Pope Leo XIV"],
  ])("%s → %s", (text, name) => {
    expect(findPublicFigures(text)).toContain(name);
  });

  it.each([
    "playing the trumpet",
    "a bush in the garden",
    "swift river at dawn",
    "standing by the gates of the park",
    "a celebrity-style red carpet headshot",
    "obamacare paperwork",
    "a modest apartment",
    "behind the scenes BTS photo",
    "drinking at the buffet",
  ])("does not flag %j", (text) => {
    expect(findPublicFigures(text)).toEqual([]);
    expect(classifyText(text).categories).not.toContain("public_figure");
  });

  it("is reported by the text filter as public_figure with the canonical name", () => {
    const result = classifyText("me hugging Tom Cruise");
    expect(result.allowed).toBe(false);
    expect(result.matches).toContainEqual({ category: "public_figure", match: "Tom Cruise" });
  });
});
