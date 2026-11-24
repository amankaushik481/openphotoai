import { describe, expect, it } from "vitest";
import { MASONRY_UNITS, masonryRowSpan } from "@/components/app/media-layout";

describe("masonryRowSpan", () => {
  it("spans rows proportional to height/width", () => {
    expect(masonryRowSpan(1024, 1024)).toBe(MASONRY_UNITS);
    expect(masonryRowSpan(1024, 1536)).toBe(6); // 2:3
    expect(masonryRowSpan(1080, 1920)).toBe(7); // 9:16
    expect(masonryRowSpan(1920, 1080)).toBe(2); // 16:9
  });

  it("falls back to 4:5 portrait for unknown sizes", () => {
    expect(masonryRowSpan(null, null)).toBe(5);
    expect(masonryRowSpan(0, 100)).toBe(5);
  });

  it("clamps extreme ratios", () => {
    expect(masonryRowSpan(5000, 100)).toBe(2);
    expect(masonryRowSpan(100, 5000)).toBe(8);
  });
});
