import { describe, expect, it } from "vitest";
import { TRAINING } from "@/config/app";
import { computeReadiness, computeReadinessByMode, poseBucket, type ReadinessPhoto } from "@/server/models/readiness";
import type { PhotoIssue, PhotoQualityReport } from "@/types/domain";

function photo(
  yaw: number | undefined,
  pitch: number | undefined,
  status: ReadinessPhoto["status"] = "accepted",
  issues: PhotoIssue[] = [],
): ReadinessPhoto {
  const quality: PhotoQualityReport = {
    score: 80,
    issues,
    metrics: { width: 1024, height: 1280, sharpness: 300, brightness: 130, contrast: 40, faceAreaRatio: 0.16, yaw, pitch },
  };
  return { status, quality };
}

const frontal = (n: number) => Array.from({ length: n }, () => photo(2, -3));

describe("poseBucket", () => {
  it.each([
    [0, 0, "frontal"],
    [14.9, 11.9, "frontal"],
    [-25.9, 3.9, "left"],
    [30.5, -4.6, "right"],
    [-1.8, 21.2, "up"],
    [1.1, -24.9, "down"],
    // The angle furthest outside its frontal range wins.
    [-11.8, 18.8, "up"],
    [20, 13, "right"],
    [undefined, -20, "down"],
  ] as const)("yaw %s pitch %s -> %s", (yaw, pitch, bucket) => {
    expect(poseBucket(yaw, pitch)).toBe(bucket);
  });

  it("is null without pose data", () => {
    expect(poseBucket(undefined, undefined)).toBeNull();
  });
});

describe("computeReadiness", () => {
  it("blocks training until enough photos are accepted", () => {
    const r = computeReadiness([...frontal(4), photo(0, 0, "rejected")], { mode: "trained", consentVerified: true });
    expect(r).toMatchObject({ total: 5, accepted: 4, rejected: 1, minRequired: TRAINING.minPhotos, maxAllowed: 30, canTrain: false });
    expect(r.blockers).toEqual(["Add 6 more good photos: you have 4 of the 10 needed."]);
    expect(r.tips[0]).toMatch(/^1 photo can't be used/);
  });

  it("needs only 3 photos in instant mode", () => {
    const r = computeReadiness(frontal(3), { mode: "instant", consentVerified: true });
    expect(r).toMatchObject({ minRequired: 3, canTrain: true, blockers: [] });
    expect(r.tips).toEqual([]);
  });

  it("requires the consent selfie", () => {
    const r = computeReadiness(frontal(12), { mode: "trained", consentVerified: false });
    expect(r.canTrain).toBe(false);
    expect(r.blockers).toContain("Take your live consent selfie first.");
  });

  it("counts pose variety and tips for missing angles", () => {
    const photos = [...frontal(6), photo(-25, 2), photo(28, -3), photo(-2, 20), photo(1, -18)];
    const r = computeReadiness(photos, { mode: "trained", consentVerified: true });
    expect(r.variety).toEqual({ frontal: 6, left: 1, right: 1, up: 1, down: 1 });
    expect(r.canTrain).toBe(true);
    expect(r.tips).toContain("Add 1 photo turned to the left.");
    expect(r.tips).toContain("Add 1 photo turned to the right.");
    expect(r.tips.some((t) => t.includes("looking"))).toBe(false);
    expect(r.tips.at(-1)).toMatch(/For the best likeness/);
  });

  it("pluralizes variety tips", () => {
    const r = computeReadiness(frontal(10), { mode: "trained", consentVerified: true });
    expect(r.tips).toEqual(
      expect.arrayContaining([
        "Add 2 photos turned to the left.",
        "Add 2 photos turned to the right.",
        "Add 1 photo looking slightly up.",
        "Add 1 photo looking slightly down.",
      ]),
    );
  });

  it("skips pose tips when the face provider reports no pose", () => {
    const r = computeReadiness(
      Array.from({ length: 10 }, () => photo(undefined, undefined)),
      { mode: "trained", consentVerified: true },
    );
    expect(r.variety).toEqual({ frontal: 0, left: 0, right: 0, up: 0, down: 0 });
    expect(r.tips.some((t) => t.startsWith("Add"))).toBe(false);
  });

  it("mentions accepted photos with warnings and blocks oversized sets", () => {
    const warn: PhotoIssue = { code: "extreme_angle", severity: "warning", message: "m", fix: "f" };
    const r = computeReadiness([...frontal(30), photo(0, 0, "accepted", [warn])], { mode: "trained", consentVerified: true });
    expect(r.accepted).toBe(31);
    expect(r.blockers).toEqual(["Remove 1 photo: a model can use up to 30."]);
    expect(r.tips.some((t) => t.startsWith("1 photo has minor issues"))).toBe(true);
  });

  it("computes both modes at once", () => {
    const both = computeReadinessByMode(frontal(5), true);
    expect(both.instant.canTrain).toBe(true);
    expect(both.trained.canTrain).toBe(false);
  });
});
