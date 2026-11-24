import { describe, expect, it } from "vitest";
import {
  BEST_SHOTS_MAX_GAP,
  buildScores,
  LIKENESS_GUARANTEE_THRESHOLD,
  pickBestShots,
  qualityFromMetrics,
} from "@/server/media/scoring";

describe("qualityFromMetrics", () => {
  it("rewards sharp, well-exposed, contrasty images", () => {
    const good = qualityFromMetrics({ sharpness: 900, brightness: 130, contrast: 60 });
    const blurry = qualityFromMetrics({ sharpness: 10, brightness: 130, contrast: 60 });
    const dark = qualityFromMetrics({ sharpness: 900, brightness: 15, contrast: 60 });
    expect(good).toBeGreaterThan(0.9);
    expect(blurry).toBeLessThan(good);
    expect(dark).toBeLessThan(good);
    for (const q of [good, blurry, dark]) expect(q).toBeGreaterThanOrEqual(0);
  });
});

describe("buildScores", () => {
  it("combines likeness and quality, or falls back to what is known", () => {
    expect(buildScores(0.9, 0.5)).toEqual({ likeness: 0.9, quality: 0.5, overall: 0.74 });
    expect(buildScores(null, 0.8)).toEqual({ quality: 0.8, overall: 0.8 });
    expect(buildScores(null, null)).toEqual({ overall: 0.5 });
  });
});

describe("pickBestShots", () => {
  it("never hides anything for fewer than 3 images (except low likeness)", () => {
    expect(pickBestShots([{ overall: 0.9 }, { overall: 0.1 }]).map((d) => d.hidden)).toEqual([false, false]);
    const low = pickBestShots([{ overall: 0.9, likeness: LIKENESS_GUARANTEE_THRESHOLD - 0.01 }]);
    expect(low[0]).toEqual({ hidden: true, lowLikeness: true });
  });

  it("hides weak outputs but keeps the top two", () => {
    const decisions = pickBestShots([
      { overall: 0.95 },
      { overall: 0.2 },
      { overall: 0.95 - BEST_SHOTS_MAX_GAP + 0.01 },
      { overall: 0.3 },
    ]);
    expect(decisions.map((d) => d.hidden)).toEqual([false, true, false, true]);
  });

  it("keeps the top two even when both are far below the best", () => {
    const decisions = pickBestShots([{ overall: 0.9 }, { overall: 0.1 }, { overall: 0.05 }]);
    expect(decisions.map((d) => d.hidden)).toEqual([false, false, true]);
  });

  it("applies the likeness guarantee regardless of rank", () => {
    const decisions = pickBestShots([{ overall: 0.9, likeness: 0.3 }, { overall: 0.8, likeness: 0.8 }, { overall: 0.79, likeness: 0.9 }]);
    expect(decisions[0]).toEqual({ hidden: true, lowLikeness: true });
    expect(decisions[1]!.hidden).toBe(false);
  });
});
