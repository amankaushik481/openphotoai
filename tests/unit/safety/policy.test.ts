import { describe, expect, it } from "vitest";
import { TRAINING } from "@/config/app";
import { cosineSimilarity, isValidEmbedding, l2normalize, meanEmbedding } from "@/server/safety/embeddings";
import { canonicalCategory, primaryCategory, SAFETY_POLICY, textBlockedMessage } from "@/server/safety/policy";

describe("embeddings", () => {
  it("normalizes to unit length", () => {
    expect(l2normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(l2normalize([0, 0])).toEqual([0, 0]);
  });

  it("computes cosine similarity and rejects mismatched dimensions", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 2])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-3, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/dimension/);
  });

  it("averages normalized vectors", () => {
    const mean = meanEmbedding([
      [1, 0],
      [0, 10],
    ]);
    expect(mean[0]).toBeCloseTo(Math.SQRT1_2);
    expect(mean[1]).toBeCloseTo(Math.SQRT1_2);
    expect(() => meanEmbedding([])).toThrow();
  });

  it("validates embeddings", () => {
    expect(isValidEmbedding([0.1, 0.2])).toBe(true);
    expect(isValidEmbedding([])).toBe(false);
    expect(isValidEmbedding([0, 0])).toBe(false);
    expect(isValidEmbedding([1, Number.NaN])).toBe(false);
    expect(isValidEmbedding(null)).toBe(false);
  });
});

describe("policy", () => {
  it("derives thresholds from config with hard floors", () => {
    expect(SAFETY_POLICY.minIdentityAge).toBe(Math.max(18, TRAINING.minAge) + Math.max(2, TRAINING.ageMargin));
    expect(SAFETY_POLICY.minIdentityAge).toBeGreaterThanOrEqual(20);
    expect(SAFETY_POLICY.minReferenceAge).toBeGreaterThanOrEqual(19);
    expect(SAFETY_POLICY.minOutputAge).toBeGreaterThanOrEqual(20);
    expect(SAFETY_POLICY.videoSampleFps).toBeGreaterThanOrEqual(1);
    expect(SAFETY_POLICY.minPhotos).toEqual({ trained: TRAINING.minPhotos, instant: 3 });
    expect(Object.isFrozen(SAFETY_POLICY)).toBe(true);
  });

  it.each([
    ["sexual", "sexual"],
    ["sexual/minors", "minors"],
    ["Porn", "sexual"],
    ["Hentai", "sexual"],
    ["violence/graphic", "violence_gore"],
    ["self-harm", "violence_gore"],
    ["hate/threatening", "hate"],
    ["harassment", "hate"],
    ["public_figure", "public_figure"],
    ["moderation_error", "moderation_error"],
    ["mock_blocked", "other"],
  ])("maps provider category %s → %s", (label, expected) => {
    expect(canonicalCategory(label)).toBe(expected);
  });

  it("picks the most severe category for the message", () => {
    expect(primaryCategory(["hate", "sexual", "minors"])).toBe("minors");
    expect(primaryCategory([])).toBe("other");
    expect(textBlockedMessage(["violence"])).toMatch(/violence/i);
  });
});
