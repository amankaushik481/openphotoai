import { describe, expect, it } from "vitest";
import { photoStepStatus, rejectionIssues } from "@/components/models/photo-issues";

const mode = (accepted: number, minRequired: number, blockers: string[] = []) => ({
  accepted,
  minRequired,
  canTrain: accepted >= minRequired && blockers.length === 0,
  blockers,
});

describe("photoStepStatus", () => {
  it("counts down to Instant, then to Trained", () => {
    expect(photoStepStatus({ instant: mode(1, 3), trained: mode(1, 10) }, 0)).toEqual({
      canContinue: false,
      detail: "2 more for Instant",
      reason: "Add at least 2 more good photos to continue.",
    });
    expect(photoStepStatus({ instant: mode(2, 3), trained: mode(2, 10) }, 0).reason).toBe(
      "Add at least 1 more good photo to continue.",
    );
    expect(photoStepStatus({ instant: mode(4, 3), trained: mode(4, 10) }, 0)).toEqual({
      canContinue: true,
      detail: "Instant ready · 6 more for Trained",
      reason: null,
    });
    expect(photoStepStatus({ instant: mode(12, 3), trained: mode(12, 10) }, 0).detail).toBe("Ready for Instant or Trained");
  });

  it("surfaces readiness blockers that aren't about the count", () => {
    const status = photoStepStatus({ instant: mode(3, 3, ["Add a photo facing the camera."]), trained: mode(3, 10) }, 0);
    expect(status).toMatchObject({ canContinue: false, reason: "Add a photo facing the camera." });
  });

  // Regression: Continue was enabled as soon as Instant was possible, even with photos still uploading.
  // Moving on unmounted the dropzone and dropped the queued photos, so the model started without them.
  it("holds Continue while uploads are still in flight", () => {
    const status = photoStepStatus({ instant: mode(5, 3), trained: mode(5, 10) }, 2);
    expect(status).toEqual({
      canContinue: false,
      detail: "Checking 2 photos…",
      reason: "Wait for 2 photos to finish uploading.",
    });
    expect(photoStepStatus({ instant: mode(5, 3), trained: mode(5, 10) }, 1).reason).toBe("Wait for 1 photo to finish uploading.");
  });
});

describe("rejectionIssues", () => {
  it("reads the quality issues of a rejected upload", () => {
    const issues = [{ code: "blurry", severity: "error", message: "Too blurry.", fix: "Hold still." }];
    expect(rejectionIssues({ stored: false, quality: { issues } })).toEqual(issues);
    expect(rejectionIssues(undefined)).toBeNull();
    expect(rejectionIssues({ quality: {} })).toBeNull();
  });
});
