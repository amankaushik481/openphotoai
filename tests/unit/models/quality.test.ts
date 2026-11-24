import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserRow } from "@/db/types";
import { setProviderOverrides } from "@/providers/registry";
import { normalizeImage, perceptualHash } from "@/server/images/process";
import { analyzeTrainingPhoto, QUALITY_THRESHOLDS, qualityScore, SAFETY_ISSUE_CODES } from "@/server/models/quality";
import type { PhotoIssueCode } from "@/types/domain";
import { createTestDb, createTestUser } from "../../helpers/db";
import { ALICE, embeddingOf, fixedFaceProvider, selfie } from "./helpers";

let user: UserRow;
beforeAll(async () => {
  await createTestDb();
});
beforeEach(async () => {
  user = await createTestUser();
  setProviderOverrides(null);
});
afterEach(() => setProviderOverrides(null));

async function analyze(bytes: Uint8Array, existingPhashes: string[] = []) {
  const normalized = await normalizeImage(bytes);
  return analyzeTrainingPhoto({
    bytes: normalized.bytes,
    consentEmbedding: embeddingOf("alice"),
    existingPhashes,
    ctx: { userId: user.id, modelId: "mdl_quality" },
  });
}

const errorCodes = (r: Awaited<ReturnType<typeof analyze>>) =>
  r.quality.issues.filter((i) => i.severity === "error").map((i) => i.code);

describe("analyzeTrainingPhoto on the selfie fixtures", () => {
  it.each(ALICE)("accepts %s", async (name) => {
    const r = await analyze(selfie(name));
    expect(errorCodes(r)).toEqual([]);
    expect(r.status).toBe("accepted");
    expect(r.safetyRejected).toBe(false);
    expect(r.quality.score).toBeGreaterThanOrEqual(60);
    expect(r.faceMatchScore).toBeGreaterThan(0.9);
    expect(r.ageEstimate).toBe(29);
    expect(r.phash).toMatch(/^[0-9a-f]{16}$/);
    const m = r.quality.metrics;
    expect(m).toMatchObject({ width: 1024, height: 1280 });
    expect(m.sharpness).toBeGreaterThan(QUALITY_THRESHOLDS.blurWarning);
    expect(m.faceAreaRatio).toBeGreaterThan(0.1);
    expect(typeof m.yaw).toBe("number");
    expect(typeof m.pitch).toBe("number");
  });

  const rejections: [string, PhotoIssueCode, boolean][] = [
    ["blurry-01", "blurry", false],
    ["dark-01", "too_dark", false],
    ["group-01", "multiple_faces", true],
    ["bob-01", "face_mismatch", true],
    ["teen-01", "underage", true],
    ["nsfw-01", "nsfw", true],
  ];
  it.each(rejections)("rejects %s for %s", async (name, code, safety) => {
    const r = await analyze(selfie(name));
    expect(r.status).toBe("rejected");
    expect(errorCodes(r)).toContain(code);
    // The first error shown to the user is the real reason.
    expect(r.quality.issues[0]).toMatchObject({ code, severity: "error" });
    expect(r.safetyRejected).toBe(safety);
    expect(r.quality.score).toBeLessThanOrEqual(40);
  });

  it("reports only the cause for dark photos (not blur / contrast symptoms)", async () => {
    const r = await analyze(selfie("dark-01"));
    expect(r.quality.issues.map((i) => i.code)).toEqual(["too_dark"]);
  });

  it("does not flag safe technical rejects as safety rejections", async () => {
    const r = await analyze(selfie("blurry-01"));
    expect(r.quality.issues.map((i) => i.code)).toEqual(["blurry"]);
    expect(r.faceMatchScore).toBeGreaterThan(0.9);
  });
});

describe("technical checks", () => {
  it("rejects photos smaller than the minimum side", async () => {
    const small = await sharp(selfie("alice-01")).resize(400, 500).jpeg({ quality: 92 }).toBuffer();
    const r = await analyze(new Uint8Array(small));
    expect(errorCodes(r)).toContain("too_small");
    expect(r.status).toBe("rejected");
  });

  it("rejects near-duplicates of photos already in the set (also after re-encoding)", async () => {
    const first = await normalizeImage(selfie("alice-01"));
    const hash = await perceptualHash(first.bytes);
    const reencoded = await sharp(selfie("alice-01")).resize(900).jpeg({ quality: 70 }).toBuffer();
    for (const bytes of [selfie("alice-01"), new Uint8Array(reencoded)]) {
      const r = await analyze(bytes, [hash]);
      expect(errorCodes(r)).toEqual(["duplicate"]);
    }
    // Different photos of the same person are not duplicates.
    const other = await analyze(selfie("alice-02"), [hash]);
    expect(errorCodes(other)).toEqual([]);
  });

  it("rejects faces that are too small, and warns about smallish ones", async () => {
    setProviderOverrides({ face: fixedFaceProvider({ box: { x: 480, y: 600, width: 100, height: 120 } }) });
    expect(errorCodes(await analyze(selfie("alice-01")))).toContain("face_too_small");

    setProviderOverrides({ face: fixedFaceProvider({ box: { x: 420, y: 500, width: 220, height: 260 } }) });
    const r = await analyze(selfie("alice-01"));
    expect(r.status).toBe("accepted");
    expect(r.quality.issues).toContainEqual(expect.objectContaining({ code: "face_too_small", severity: "warning" }));
  });

  it("rejects faces cut off at the frame edge", async () => {
    setProviderOverrides({ face: fixedFaceProvider({ box: { x: 300, y: 0, width: 420, height: 500 } }) });
    expect(errorCodes(await analyze(selfie("alice-01")))).toContain("face_cut_off");
  });

  it("warns (but accepts) extreme head angles", async () => {
    setProviderOverrides({ face: fixedFaceProvider({ yaw: -60, pitch: 5 }) });
    const r = await analyze(selfie("alice-01"));
    expect(r.status).toBe("accepted");
    expect(r.quality.issues).toEqual([expect.objectContaining({ code: "extreme_angle", severity: "warning" })]);
    expect(r.quality.metrics.yaw).toBe(-60);
  });

  it("gives every issue a plain-language message and a fix", async () => {
    const all = await Promise.all(["blurry-01", "dark-01", "group-01", "bob-01", "teen-01", "nsfw-01"].map((n) => analyze(selfie(n))));
    for (const issue of all.flatMap((r) => r.quality.issues)) {
      expect(issue.message.length).toBeGreaterThan(10);
      expect(issue.fix.length).toBeGreaterThan(10);
    }
  });
});

describe("qualityScore", () => {
  const metrics = { width: 1024, height: 1280, sharpness: 300, brightness: 135, contrast: 45, faceAreaRatio: 0.16 };

  it("is high for a clean photo and drops with issues", () => {
    expect(qualityScore(metrics, [])).toBe(100);
    const warning = { code: "extreme_angle", severity: "warning", message: "m", fix: "f" } as const;
    const error = { code: "blurry", severity: "error", message: "m", fix: "f" } as const;
    expect(qualityScore(metrics, [warning])).toBe(92);
    expect(qualityScore(metrics, [error])).toBeLessThanOrEqual(40);
    expect(qualityScore({ ...metrics, sharpness: 0, brightness: 0, contrast: 0, faceAreaRatio: 0 }, [error, error])).toBe(0);
  });

  it("classifies safety issue codes", () => {
    expect(SAFETY_ISSUE_CODES.has("face_mismatch")).toBe(true);
    expect(SAFETY_ISSUE_CODES.has("blurry")).toBe(false);
  });
});
