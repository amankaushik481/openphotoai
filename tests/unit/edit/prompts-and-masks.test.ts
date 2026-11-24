import { describe, expect, it } from "vitest";
import { cleanInstruction, editPrompt, type EditKind } from "@/server/jobs/handlers/edit";
import {
  analyzeMask,
  inpaintPrompt,
  MASK_ASPECT_TOLERANCE,
  maskAspectMatches,
  maskPixelStats,
  normalizedMaskKey,
  resizeMask,
} from "@/server/jobs/handlers/inpaint";
import { closestAspectRatio } from "@/server/jobs/handlers/pose-copy";
import { EDIT_KINDS } from "@/types/domain";
import { describePng, maskPng } from "./helpers";

describe("edit prompt templates", () => {
  const cases: Record<EditKind, RegExp> = {
    outfit: /^Change only the clothing the man is wearing to: a navy suit\. Keep the same face and identity/,
    background: /^Replace only the background with: a navy suit\. Keep the man exactly as they are \(face and identity/,
    hair: /^Change only the hairstyle of the man to: a navy suit\. Keep the same face and identity/,
    expression: /^Change only the facial expression of the man to: a navy suit\. Keep the same identity and facial features/,
    custom: /^A navy suit\. Keep the man's face and identity, and everything this instruction doesn't mention/,
  };

  it.each(EDIT_KINDS)("%s: changes only what was asked and pins the identity", (kind) => {
    const prompt = editPrompt(kind, "  a navy   suit. ", "man");
    expect(prompt).toMatch(cases[kind]);
    expect(prompt).toMatch(/identity/);
    expect(prompt).not.toMatch(/\s{2}/);
  });

  it("refers to 'the person' without an identity and keeps the change scoped", () => {
    expect(editPrompt("hair", "short fade haircut")).toContain("hairstyle of the person to: short fade haircut.");
    expect(editPrompt("background", "studio grey backdrop")).toContain("match the lighting on them to the new background");
    expect(editPrompt("outfit", "navy suit")).toContain("background exactly as they are");
  });

  it("cleans instructions: placeholders, whitespace and trailing punctuation", () => {
    expect(cleanInstruction("give {subject} a warm smile!! ", "the woman")).toBe("give the woman a warm smile");
    expect(cleanInstruction("\n add glasses ;,", "x")).toBe("add glasses");
    expect(cleanInstruction("...", "x")).toBe("");
  });

  it("describes the repainted area for inpainting", () => {
    expect(inpaintPrompt("a red scarf.", "woman")).toBe(
      "a red scarf, seamlessly blended into the rest of the photo with matching lighting, perspective, colour and grain, photorealistic",
    );
    expect(inpaintPrompt("{subject} wearing a hat")).toMatch(/^the person wearing a hat, /);
  });
});

describe("mask helpers", () => {
  it("accepts aspect ratios within 2% and rejects the rest", () => {
    expect(MASK_ASPECT_TOLERANCE).toBe(0.02);
    expect(maskAspectMatches({ width: 1024, height: 1280 }, { width: 1024, height: 1280 })).toBe(true);
    expect(maskAspectMatches({ width: 512, height: 640 }, { width: 1024, height: 1280 })).toBe(true);
    expect(maskAspectMatches({ width: 1000, height: 1270 }, { width: 1000, height: 1250 })).toBe(true); // 1.6%
    expect(maskAspectMatches({ width: 1000, height: 1290 }, { width: 1000, height: 1250 })).toBe(false); // 3.1%
    expect(maskAspectMatches({ width: 1280, height: 1024 }, { width: 1024, height: 1280 })).toBe(false); // rotated
    expect(maskAspectMatches({ width: 0, height: 10 }, { width: 10, height: 10 })).toBe(false);
  });

  it("measures painted coverage and transparency for every channel layout", () => {
    // 4 pixels: white, black, grey(128), white-but-transparent.
    const grey = new Uint8Array([255, 0, 128, 255]);
    expect(maskPixelStats(grey, 1)).toEqual({ coverage: 0.75, transparent: false });
    const greyAlpha = new Uint8Array([255, 255, 0, 255, 128, 255, 255, 0]);
    expect(maskPixelStats(greyAlpha, 2)).toEqual({ coverage: 0.5, transparent: true });
    const rgb = new Uint8Array([255, 255, 255, 0, 0, 0, 10, 10, 10, 0, 0, 0]);
    expect(maskPixelStats(rgb, 3)).toEqual({ coverage: 0.5, transparent: false });
    const rgba = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 0, 0, 0, 255]);
    expect(maskPixelStats(rgba, 4)).toEqual({ coverage: 0.25, transparent: true });
  });

  it("analyzes a PNG mask's size, coverage and transparency", async () => {
    const opaque = await analyzeMask(await maskPng(200, 100, { x: 0, y: 0, w: 100, h: 100 }));
    expect(opaque).toMatchObject({ width: 200, height: 100, hasAlpha: false });
    expect(opaque.coverage).toBeCloseTo(0.5, 2);
    const transparent = await analyzeMask(await maskPng(200, 100, { x: 0, y: 0, w: 50, h: 100 }, { alpha: true }));
    expect(transparent.hasAlpha).toBe(true);
    expect(transparent.coverage).toBeCloseTo(0.25, 2);
    const empty = await analyzeMask(await maskPng(64, 64, null));
    expect(empty.coverage).toBe(0);
  });

  it("resizes masks to exact pixels as pure black/white, flattening transparency to black", async () => {
    const out = await resizeMask(await maskPng(100, 125, { x: 10, y: 10, w: 30, h: 30 }, { alpha: true }), 1024, 1280);
    const info = await describePng(out);
    expect(info).toEqual({ width: 1024, height: 1280, levels: [0, 255] });
    const stats = await analyzeMask(out);
    expect(stats.hasAlpha).toBe(false);
    expect(stats.coverage).toBeCloseTo((30 * 30) / (100 * 125), 2);
  });

  it("stores normalized masks under the user's uploads prefix", () => {
    expect(normalizedMaskKey("usr_1", "upl_2", { width: 400, height: 500 })).toBe("users/usr_1/uploads/upl_2_400x500.png");
  });
});

describe("closestAspectRatio", () => {
  it("maps reference sizes to the nearest supported ratio", () => {
    expect(closestAspectRatio(1080, 1920)).toBe("9:16");
    expect(closestAspectRatio(1200, 1200)).toBe("1:1");
    expect(closestAspectRatio(3000, 2000)).toBe("3:2");
    expect(closestAspectRatio(800, 1000)).toBe("4:5");
    expect(closestAspectRatio(null, 100)).toBe("4:5");
  });
});
