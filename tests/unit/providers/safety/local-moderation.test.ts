import { describe, expect, it } from "vitest";
import { classifyNsfw, createLocalModerationProvider, strictThresholds } from "@/providers/safety/local-moderation";
import { DEFAULT_NSFW_THRESHOLDS } from "@/providers/safety/nsfw-policy";
import { blankImage, gradientImage, hasHumanSamples, manPortrait } from "./samples";

describe("createLocalModerationProvider", () => {
  const provider = createLocalModerationProvider();

  it("has no public-figure detection locally", () => {
    expect(provider.name).toBe("local");
    expect(provider.detectPublicFigure).toBeUndefined();
  });

  it("runs the bundled nsfwjs model offline and returns a probability distribution", async () => {
    const probs = await classifyNsfw(await gradientImage());
    expect(probs).toHaveLength(5);
    expect(Array.from(probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  }, 60_000);

  it.each([
    ["solid colour", blankImage],
    ["gradient", gradientImage],
  ])("allows a benign generated image (%s)", async (_name, make) => {
    const res = await provider.checkImage(await make());
    expect(res).toMatchObject({ allowed: true, categories: [], provider: "local" });
    expect(res.scores?.neutral).toBeGreaterThan(0.5);
    expect(res.scores?.explicit).toBeLessThan(DEFAULT_NSFW_THRESHOLDS.explicit);
  }, 60_000);

  it.skipIf(!hasHumanSamples)("allows an ordinary portrait photo", async () => {
    const res = await provider.checkImage(await manPortrait());
    expect(res.allowed).toBe(true);
  }, 60_000);

  it("rejects bytes that are not an image (callers fail closed)", async () => {
    await expect(provider.checkImage(new Uint8Array([0, 1, 2]))).rejects.toThrow();
  });

  it("blocks with the configured (stricter) thresholds", async () => {
    // A zero threshold blocks everything: proves the decision path is wired to the model output.
    const strict = createLocalModerationProvider({ thresholds: { combined: 0 } });
    const res = await strict.checkImage(await gradientImage());
    expect(res).toMatchObject({ allowed: false, categories: ["sexual"] });
  }, 60_000);

  it("checkText runs the heuristic layer", async () => {
    await expect(provider.checkText("professional headshot in a navy suit")).resolves.toEqual({
      allowed: true,
      categories: [],
      provider: "local",
    });
    const blocked = await provider.checkText("naked on the beach");
    expect(blocked).toMatchObject({ allowed: false, categories: ["sexual"], provider: "local" });
    expect(blocked.reason).toContain("naked");
  });
});

describe("strictThresholds", () => {
  it("keeps defaults and only allows tightening", () => {
    expect(strictThresholds()).toEqual(DEFAULT_NSFW_THRESHOLDS);
    expect(strictThresholds({ explicit: 0.2, suggestive: 0.99, combined: 5 })).toEqual({
      explicit: 0.2,
      suggestive: DEFAULT_NSFW_THRESHOLDS.suggestive,
      combined: DEFAULT_NSFW_THRESHOLDS.combined,
    });
    expect(strictThresholds({ explicit: Number.NaN, suggestive: -1 })).toEqual(DEFAULT_NSFW_THRESHOLDS);
  });
});
