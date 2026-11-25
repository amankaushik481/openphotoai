import { describe, expect, it } from "vitest";
import {
  CAMERA_ERRORS,
  CAPTURE_STAGES,
  cameraErrorKind,
  captureStage,
  reviewActions,
  suggestOtherDevice,
} from "@/components/models/camera-logic";

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("cameraErrorKind", () => {
  it("maps getUserMedia failures to explainable kinds", () => {
    expect(cameraErrorKind(domError("NotAllowedError"))).toBe("denied");
    expect(cameraErrorKind(domError("SecurityError"))).toBe("denied");
    expect(cameraErrorKind(domError("NotFoundError"))).toBe("not_found");
    expect(cameraErrorKind(domError("OverconstrainedError"))).toBe("not_found");
    expect(cameraErrorKind(domError("NotReadableError"))).toBe("busy");
    expect(cameraErrorKind(domError("TypeError"))).toBe("unsupported");
    expect(cameraErrorKind(new Error("boom"))).toBe("unknown");
    expect(cameraErrorKind("nope")).toBe("unknown");
    expect(cameraErrorKind(null)).toBe("unknown");
  });

  it("works with DOMException-like objects that aren't Error instances", () => {
    expect(cameraErrorKind({ name: "NotAllowedError", message: "" })).toBe("denied");
  });

  it("has a title and a recovery hint for every kind", () => {
    for (const { title, body } of Object.values(CAMERA_ERRORS)) {
      expect(title.length).toBeGreaterThan(5);
      expect(body).toMatch(/try again|phone|allow/i);
    }
  });

  it("suggests another device only when this one can't do it", () => {
    expect(suggestOtherDevice("not_found")).toBe(true);
    expect(suggestOtherDevice("unsupported")).toBe(true);
    expect(suggestOtherDevice("busy")).toBe(false);
    expect(suggestOtherDevice("interrupted")).toBe(false);
  });
});

describe("reviewActions", () => {
  it("offers 'Use this selfie' for a fresh capture", () => {
    expect(reviewActions({ failed: false })).toEqual({ confirm: true, primary: "confirm" });
  });

  // Regression: after a failed verification the capture token is spent server-side, yet the review
  // screen kept offering "Use this selfie", which could only fail again with "Please retake".
  it("requires a retake after a failed submission", () => {
    expect(reviewActions({ failed: true })).toEqual({ confirm: false, primary: "retake" });
  });
});

describe("captureStage", () => {
  it("follows the capture through selfie, head moves and the check", () => {
    expect(captureStage("idle")).toBeNull();
    expect(captureStage("live")).toBeNull();
    expect(captureStage("countdown")).toBe("selfie");
    expect(captureStage("step")).toBe("moves");
    expect(captureStage("review")).toBe("check");
    expect(captureStage("submitting")).toBe("check");
    expect(CAPTURE_STAGES.map((s) => s.id)).toEqual(["selfie", "moves", "check"]);
  });
});
