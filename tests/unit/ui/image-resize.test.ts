import { describe, expect, it } from "vitest";
import { computeResizeDimensions, downscaleSteps } from "@/components/app/image-resize";

describe("computeResizeDimensions", () => {
  it("never upscales images already within the limit", () => {
    expect(computeResizeDimensions(1200, 800, 2048)).toEqual({ width: 1200, height: 800, scale: 1 });
    expect(computeResizeDimensions(2048, 2048, 2048)).toEqual({ width: 2048, height: 2048, scale: 1 });
  });

  it("fits the long side of a landscape image to maxSide and keeps the ratio", () => {
    const r = computeResizeDimensions(4032, 3024, 2048);
    expect(r.width).toBe(2048);
    expect(r.height).toBe(1536);
    expect(r.scale).toBeCloseTo(2048 / 4032);
  });

  it("fits the long side of a portrait image", () => {
    const r = computeResizeDimensions(3000, 4000, 2048);
    expect(r).toMatchObject({ width: 1536, height: 2048 });
  });

  it("rounds the short side and never collapses it to zero", () => {
    expect(computeResizeDimensions(10000, 3, 2048)).toMatchObject({ width: 2048, height: 1 });
    expect(computeResizeDimensions(3001, 2001, 2048).height).toBe(Math.round(2001 * (2048 / 3001)));
  });

  it("rejects invalid input", () => {
    expect(() => computeResizeDimensions(0, 100, 2048)).toThrow(RangeError);
    expect(() => computeResizeDimensions(100, Number.NaN, 2048)).toThrow(RangeError);
    expect(() => computeResizeDimensions(100, 100, 0)).toThrow(RangeError);
  });
});

describe("downscaleSteps", () => {
  it("draws once when shrinking by 2× or less", () => {
    expect(downscaleSteps({ width: 4096, height: 3072 }, { width: 2048, height: 1536 })).toEqual([
      { width: 2048, height: 1536 },
    ]);
    expect(downscaleSteps({ width: 1000, height: 800 }, { width: 1000, height: 800 })).toEqual([
      { width: 1000, height: 800 },
    ]);
  });

  it("halves progressively for large reductions and ends on the exact target", () => {
    const steps = downscaleSteps({ width: 8000, height: 6000 }, { width: 2048, height: 1536 });
    expect(steps).toEqual([
      { width: 4000, height: 3000 },
      { width: 2048, height: 1536 },
    ]);
  });
});
