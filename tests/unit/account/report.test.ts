import { describe, expect, it } from "vitest";
import { anonymizeModerationDetails } from "@/server/account/anonymize";
import {
  describeDeletion,
  isDeletionFinished,
  newDeletionReport,
  parseDeletionReport,
  DELETION_STEPS,
} from "@/server/account/report";

describe("anonymizeModerationDetails", () => {
  it("keeps the decision, drops the user's words, errors, ids and unknown keys", () => {
    expect(
      anonymizeModerationDetails({
        stage: "pre_training",
        categories: ["sexual"],
        threshold: 0.6,
        sha256: "abc",
        text: { excerpt: "my prompt", sha256: "def", length: 9 },
        error: "provider echoed: my prompt",
        reasons: ["my prompt"],
        photoIds: ["tph_1"],
        somethingNew: "?",
      }),
    ).toEqual({
      stage: "pre_training",
      categories: ["sexual"],
      threshold: 0.6,
      sha256: "abc",
      text: { sha256: "def", length: 9 },
      anonymized: true,
    });
  });

  it("handles empty details", () => {
    expect(anonymizeModerationDetails(null)).toEqual({ anonymized: true });
  });
});

describe("deletion report helpers", () => {
  it("parses only full reports (a lease-only object is not one)", () => {
    expect(parseDeletionReport(null)).toBeNull();
    expect(parseDeletionReport({ leaseUntil: new Date().toISOString() })).toBeNull();
    const report = newDeletionReport(new Date("2026-01-01T00:00:00Z"));
    expect(parseDeletionReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it("is finished only when every step is done", () => {
    const report = newDeletionReport(new Date());
    expect(isDeletionFinished(report)).toBe(false);
    for (const step of DELETION_STEPS) report.steps[step] = { status: "done", at: "" };
    expect(isDeletionFinished(report)).toBe(true);
    report.steps.storage = { status: "failed", at: "", error: "x" };
    expect(isDeletionFinished(report)).toBe(false);
  });

  it("describes what was deleted for the final email", () => {
    expect(
      describeDeletion({
        identityModels: 1,
        trainingPhotos: 12,
        media: 1,
        uploads: 0,
        jobs: 3,
        shareLinks: 2,
        subscriptions: 1,
      }),
    ).toBe(
      "1 identity model, 12 training photos, 1 photo or video, 0 uploads, 2 share links, 1 subscription canceled, plus your profile, sign-in methods, API keys and history.",
    );
    expect(describeDeletion(undefined)).toMatch(/profile/);
  });
});
