import { describe, expect, it } from "vitest";
import {
  describe as describeDist,
  equalErrorRate,
  errorRates,
  pairScores,
  quantile,
  thresholdForFar,
  thresholdTable,
  type LabeledEmbedding,
} from "@/providers/safety/face-calibration";
import { cosineSimilarity, l2Normalize, radToDeg, round } from "@/providers/safety/face-math";

describe("face math", () => {
  it("l2Normalize produces unit vectors and keeps zero vectors at zero", () => {
    const v = l2Normalize([3, 4]);
    expect(v).toEqual([0.6, 0.8]);
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
  });

  it.each([
    [[1, 0], [1, 0], 1],
    [[1, 0], [0, 1], 0],
    [[1, 0], [-1, 0], -1],
    [[2, 2], [1, 1], 1],
    [[0, 0], [1, 1], 0],
  ])("cosineSimilarity(%j, %j) = %d", (a, b, expected) => {
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });

  it("cosineSimilarity rejects mismatched lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length/);
  });

  it("converts radians and rounds", () => {
    expect(radToDeg(Math.PI / 2)).toBe(90);
    expect(round(1.23456, 2)).toBe(1.23);
  });
});

describe("face calibration statistics", () => {
  const sample = (label: string, embedding: number[]): LabeledEmbedding => ({ label, source: label, embedding });
  const samples = [
    sample("a", [1, 0, 0]),
    sample("a", [0.9, 0.1, 0]),
    sample("b", [0, 1, 0]),
    sample("b", [0.1, 0.9, 0]),
    sample("c", [0, 0, 1]),
  ];

  it("splits pairs into same / different", () => {
    const s = pairScores(samples);
    expect(s.same).toHaveLength(2);
    expect(s.different).toHaveLength(8);
    expect(Math.min(...s.same)).toBeGreaterThan(0.9);
    expect(Math.max(...s.different)).toBeLessThan(0.25);
  });

  it("anchor mode only scores pairs involving the anchor identity", () => {
    const s = pairScores(samples, { anchorLabel: "a" });
    expect(s.same).toHaveLength(1);
    expect(s.different).toHaveLength(6);
  });

  it("computes quantiles and distributions", () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    expect(describeDist([1, 2, 3, 4, 5])).toMatchObject({ n: 5, min: 1, median: 3, max: 5 });
  });

  it("computes error rates, FAR-targeted thresholds and the EER", () => {
    const scores = { same: [0.7, 0.8, 0.9, 0.5], different: [0.1, 0.3, 0.55, 0.6] };
    expect(errorRates(scores, 0.6)).toEqual({ threshold: 0.6, falseRejectRate: 0.25, falseAcceptRate: 0.25 });
    expect(thresholdForFar(scores, 0)).toBeCloseTo(0.6, 3);
    expect(thresholdForFar({ same: [0.9], different: [] }, 0)).toBeNull();
    const eer = equalErrorRate(scores);
    expect(eer?.rate).toBeCloseTo(0.25, 5);
    const table = thresholdTable(scores, 0.5, 0.6, 0.05);
    expect(table.map((r) => r.threshold)).toEqual([0.5, 0.55, 0.6]);
  });
});
