import { describe, expect, it } from "vitest";
import {
  allowedUpscaleScales,
  isTransparentImage,
  sizeOf,
  upscaleBlock,
  upscaleBlockMessage,
  upscaleTarget,
  UPSCALE_MAX_RESULT_LONG_SIDE,
  UPSCALE_MAX_SOURCE_LONG_SIDE,
} from "@/components/enhance/enhance-rules";
import {
  actionAvailability,
  enhanceCost,
  enhanceErrorInfo,
  enhanceRequest,
  formatSize,
  megapixels,
  newIdempotencyKey,
  preferredUpscaleScale,
  SOURCE_NOT_FOUND_MESSAGE,
  upscalePreview,
  upscaleScalesFor,
} from "@/components/enhance/enhance-ui";
import { creditCost, CREDIT_COSTS } from "@/config/credits";
import { ApiClientError } from "@/lib/api-client";
import { createJobRequest } from "@/types/domain";

const photo = (over: { width?: number | null; height?: number | null; mimeType?: string; kind?: "image" | "video" } = {}) => ({
  kind: over.kind ?? ("image" as const),
  mimeType: over.mimeType ?? "image/jpeg",
  width: over.width === undefined ? 1024 : over.width,
  height: over.height === undefined ? 1280 : over.height,
});

describe("upscale target resolution", () => {
  it("multiplies both sides by the scale", () => {
    expect(upscaleTarget({ width: 1024, height: 1280 }, 2)).toEqual({ width: 2048, height: 2560 });
    expect(upscaleTarget({ width: 816, height: 1024 }, 4)).toEqual({ width: 3264, height: 4096 });
  });

  it("previews source -> result with megapixels", () => {
    expect(upscalePreview(photo(), 2)).toEqual({
      from: { width: 1024, height: 1280 },
      to: { width: 2048, height: 2560 },
      megapixels: 5.2,
    });
    expect(upscalePreview(photo({ width: null }), 2)).toBeNull();
    expect(megapixels({ width: 4096, height: 4096 })).toBe(16.8);
    expect(formatSize({ width: 2048, height: 2560 })).toBe("2048 × 2560");
  });

  it("treats missing or invalid dimensions as unknown", () => {
    expect(sizeOf({ width: null, height: 100 })).toBeNull();
    expect(sizeOf({ width: 0, height: 100 })).toBeNull();
    expect(sizeOf({ width: 10.5, height: 100 })).toBeNull();
    expect(sizeOf({ width: 10, height: 20 })).toEqual({ width: 10, height: 20 });
  });
});

describe("upscale limits", () => {
  it("refuses sources that are already high resolution", () => {
    const big = { width: 3000, height: UPSCALE_MAX_SOURCE_LONG_SIDE };
    expect(upscaleBlock(big, 2)).toBe("source_too_large");
    expect(allowedUpscaleScales(big)).toEqual([]);
    expect(upscaleBlockMessage("source_too_large", big, 2)).toMatch(/already high resolution \(4096 px/);
  });

  it("refuses results larger than the maximum and suggests a smaller factor", () => {
    const mid = { width: 2500, height: 2000 };
    expect(upscaleBlock(mid, 2)).toBeNull();
    expect(upscaleBlock(mid, 4)).toBe("result_too_large");
    expect(allowedUpscaleScales(mid)).toEqual([2]);
    expect(upscaleBlockMessage("result_too_large", mid, 4)).toBe(
      `A 4× upscale would be 10000 px on its long side; the maximum is ${UPSCALE_MAX_RESULT_LONG_SIDE} px. Try 2× instead.`,
    );
    // Exactly at the maximum is fine.
    expect(upscaleBlock({ width: 2048, height: 1024 }, 4)).toBeNull();
  });

  it("allows everything when the size is unknown (the server probes it)", () => {
    expect(upscaleBlock(null, 4)).toBeNull();
    expect(allowedUpscaleScales(null)).toEqual([2, 4]);
  });
});

describe("action availability", () => {
  it("disables every action for videos", () => {
    const video = photo({ kind: "video", mimeType: "video/mp4" });
    for (const action of ["upscale", "face_restore", "remove_background"] as const) {
      const a = actionAvailability(video, action);
      expect(a.available).toBe(false);
      expect(a.reason).toMatch(/photos only/i);
    }
    expect(upscaleScalesFor(video)).toEqual([]);
  });

  it("disables background removal on transparent PNGs only", () => {
    expect(isTransparentImage("image/png")).toBe(true);
    expect(isTransparentImage("IMAGE/PNG; charset=binary")).toBe(true);
    expect(isTransparentImage("image/jpeg")).toBe(false);
    const png = photo({ mimeType: "image/png" });
    expect(actionAvailability(png, "remove_background")).toEqual({
      available: false,
      reason: "This photo already has a transparent background.",
    });
    expect(actionAvailability(png, "upscale").available).toBe(true);
    expect(actionAvailability(photo(), "remove_background").available).toBe(true);
  });

  it("mirrors the upscale size guards per factor", () => {
    const mid = photo({ width: 2500, height: 2000 });
    expect(actionAvailability(mid, "upscale", 2).available).toBe(true);
    expect(actionAvailability(mid, "upscale", 4).available).toBe(false);
    expect(preferredUpscaleScale(mid)).toBe(2);
    const huge = photo({ width: 5000, height: 4000 });
    expect(preferredUpscaleScale(huge)).toBe(2);
    expect(actionAvailability(huge, "upscale", 2).reason).toMatch(/already high resolution/);
    expect(actionAvailability(huge, "face_restore").available).toBe(true);
  });
});

describe("requests and costs", () => {
  it("builds valid POST /api/jobs bodies", () => {
    expect(createJobRequest.parse(enhanceRequest("upscale", "med_1", { scale: 4, faceRestore: false }))).toEqual({
      type: "upscale",
      sourceMediaId: "med_1",
      scale: 4,
      faceRestore: false,
    });
    expect(createJobRequest.parse(enhanceRequest("upscale", "med_1"))).toMatchObject({ scale: 2, faceRestore: true });
    expect(createJobRequest.parse(enhanceRequest("face_restore", "med_1"))).toEqual({ type: "face_restore", sourceMediaId: "med_1" });
    expect(createJobRequest.parse(enhanceRequest("remove_background", "med_1"))).toEqual({
      type: "remove_background",
      sourceMediaId: "med_1",
    });
  });

  it("prices each input like the server", () => {
    expect(enhanceCost("upscale", { scale: 2, faceRestore: true })).toBe(CREDIT_COSTS.upscale2x);
    expect(enhanceCost("upscale", { scale: 4, faceRestore: false })).toBe(CREDIT_COSTS.upscale4x);
    expect(enhanceCost("face_restore")).toBe(CREDIT_COSTS.faceRestore);
    expect(enhanceCost("remove_background")).toBe(CREDIT_COSTS.removeBackground);
    expect(creditCost(enhanceRequest("upscale", "m", { scale: 4, faceRestore: true }))).toBe(5);
    expect(creditCost(enhanceRequest("upscale", "m", { scale: 2, faceRestore: false }))).toBe(2);
    expect(creditCost(enhanceRequest("face_restore", "m"))).toBe(1);
    expect(creditCost(enhanceRequest("remove_background", "m"))).toBe(1);
  });

  it("makes unique, header-safe idempotency keys", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[\x21-\x7e]{1,200}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe("error messages per API error code", () => {
  const err = (code: ConstructorParameters<typeof ApiClientError>[0], message: string, status = 400) =>
    new ApiClientError(code, message, status);

  it("keeps specific server messages for actionable codes", () => {
    expect(enhanceErrorInfo(err("validation_error", "This photo is already high resolution."))).toEqual({
      code: "validation_error",
      message: "This photo is already high resolution.",
      buyCredits: false,
    });
    expect(enhanceErrorInfo(err("insufficient_credits", "This needs 5 credits; you have 2.", 402))).toEqual({
      code: "insufficient_credits",
      message: "This needs 5 credits; you have 2.",
      buyCredits: true,
    });
    expect(enhanceErrorInfo(err("rate_limited", "Too many requests. Try again in 12s.", 429)).message).toContain("12s");
    expect(enhanceErrorInfo(err("plan_limit", "The Free plan runs up to 1 jobs at once.", 403)).message).toContain("Free plan");
  });

  it("uses friendly copy for everything else", () => {
    expect(enhanceErrorInfo(err("not_found", "Photo not found.", 404)).message).toBe(SOURCE_NOT_FOUND_MESSAGE);
    expect(enhanceErrorInfo(err("provider_error", "fal 502 upstream", 502)).message).toBe(
      "Our AI provider had a hiccup. Please try again.",
    );
    expect(enhanceErrorInfo(err("internal", "stack trace here", 500)).message).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(enhanceErrorInfo(err("network", "x", 0))).toMatchObject({ code: "network", message: "Network error — check your connection." });
    expect(enhanceErrorInfo(new Error("boom"))).toMatchObject({ code: "internal", buyCredits: false });
  });
});
