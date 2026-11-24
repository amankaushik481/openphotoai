import { describe, expect, it } from "vitest";
import {
  binarizeMask,
  clampView,
  clientToCanvas,
  dabSpacing,
  EMPTY_HISTORY,
  fitWithin,
  hasPaint,
  IDENTITY_VIEW,
  interpolateStroke,
  MAX_ZOOM,
  panView,
  percentFromPointer,
  pinchView,
  pushAction,
  redoAction,
  screenToCanvasLength,
  sliderKeyValue,
  strokeDabs,
  undoAction,
  visibleStrokes,
  zoomAt,
  type MaskAction,
  type Stroke,
} from "@/components/edit/geometry";

const viewport = { width: 400, height: 500 };
const paint = (points: { x: number; y: number }[], size = 8): Stroke => ({ mode: "paint", size, points });

describe("stroke interpolation", () => {
  it("fills gaps between samples with evenly spaced dabs, excluding the start and including the end", () => {
    const pts = interpolateStroke({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(pts).toEqual([2, 4, 6, 8, 10].map((x) => ({ x, y: 0 })));
    const diag = interpolateStroke({ x: 0, y: 0 }, { x: 3, y: 4 }, 2); // length 5 -> 3 steps
    expect(diag).toHaveLength(3);
    expect(diag.at(-1)).toEqual({ x: 3, y: 4 });
    for (let i = 1; i < diag.length; i++) {
      expect(Math.hypot(diag[i]!.x - diag[i - 1]!.x, diag[i]!.y - diag[i - 1]!.y)).toBeLessThanOrEqual(2);
    }
  });

  it("returns nothing for coincident points and tolerates a zero spacing", () => {
    expect(interpolateStroke({ x: 5, y: 5 }, { x: 5, y: 5 }, 4)).toEqual([]);
    expect(interpolateStroke({ x: 0, y: 0 }, { x: 1, y: 0 }, 0).length).toBeGreaterThan(0);
  });

  it("spaces dabs at a quarter of the brush (min 1px) and replays a whole stroke", () => {
    expect(dabSpacing(40)).toBe(10);
    expect(dabSpacing(2)).toBe(1);
    const dabs = strokeDabs(paint([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }], 8));
    expect(dabs[0]).toEqual({ x: 0, y: 0 });
    expect(dabs).toHaveLength(1 + 4 + 4);
    expect(dabs.at(-1)).toEqual({ x: 8, y: 8 });
    expect(strokeDabs(paint([]))).toEqual([]);
  });
});

describe("coordinate scaling", () => {
  it("maps client points to canvas pixels through the on-screen rect (any zoom)", () => {
    const canvas = { width: 2048, height: 2560 };
    expect(clientToCanvas(100, 50, { left: 100, top: 50, width: 400, height: 500 }, canvas)).toEqual({ x: 0, y: 0 });
    expect(clientToCanvas(300, 300, { left: 100, top: 50, width: 400, height: 500 }, canvas)).toEqual({ x: 1024, y: 1280 });
    // Zoomed 2x and panned: the rect is twice as large and offset.
    expect(clientToCanvas(500, 550, { left: -100, top: -50, width: 800, height: 1000 }, canvas)).toEqual({ x: 1536, y: 1536 });
  });

  it("converts brush sizes from screen px to canvas px", () => {
    expect(screenToCanvasLength(40, 400, 2048)).toBeCloseTo(204.8);
    expect(screenToCanvasLength(40, 800, 2048)).toBeCloseTo(102.4); // zoomed in: finer brush
  });

  it("fits sizes within a maximum side without upscaling", () => {
    expect(fitWithin({ width: 4096, height: 5120 }, 2048)).toEqual({ width: 1638, height: 2048 });
    expect(fitWithin({ width: 800, height: 1000 }, 2048)).toEqual({ width: 800, height: 1000 });
    expect(fitWithin({ width: 3000, height: 1 }, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("mask history", () => {
  const a: MaskAction = { kind: "stroke", stroke: paint([{ x: 1, y: 1 }]) };
  const b: MaskAction = { kind: "stroke", stroke: { mode: "erase", size: 8, points: [{ x: 1, y: 1 }] } };

  it("undoes, redoes and drops the redo stack on a new action", () => {
    let h = pushAction(pushAction(EMPTY_HISTORY, a), b);
    h = undoAction(h);
    expect(h.done).toEqual([a]);
    expect(h.undone).toEqual([b]);
    expect(redoAction(h).done).toEqual([a, b]);
    expect(pushAction(h, a).undone).toEqual([]);
    expect(undoAction(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
    expect(redoAction(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
  });

  it("replays only what follows the last clear, and clear is undoable", () => {
    const cleared = pushAction(pushAction(EMPTY_HISTORY, a), { kind: "clear" });
    expect(visibleStrokes(cleared.done)).toEqual([]);
    expect(hasPaint(cleared.done)).toBe(false);
    expect(hasPaint(undoAction(cleared).done)).toBe(true);
    expect(hasPaint([b])).toBe(false); // erasing alone paints nothing
  });
});

describe("mask export", () => {
  it("binarizes RGBA by alpha into opaque black/white and counts white pixels", () => {
    const data = new Uint8ClampedArray([236, 72, 153, 255, 0, 0, 0, 0, 236, 72, 153, 140, 236, 72, 153, 100]);
    expect(binarizeMask(data)).toBe(2);
    expect([...data]).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  });
});

describe("zoom and pan", () => {
  it("keeps the photo covering the viewport", () => {
    expect(clampView({ scale: 0.5, x: 10, y: 10 }, viewport)).toEqual(IDENTITY_VIEW);
    expect(clampView({ scale: 2, x: -1000, y: 50 }, viewport)).toEqual({ scale: 2, x: -400, y: 0 });
    expect(clampView({ scale: 99, x: 0, y: 0 }, viewport).scale).toBe(MAX_ZOOM);
  });

  it("zooms around an anchor point", () => {
    const v = zoomAt(IDENTITY_VIEW, { x: 200, y: 250 }, 2, viewport);
    expect(v).toEqual({ scale: 2, x: -200, y: -250 });
    // The content under the anchor stays put.
    expect({ x: (200 - v.x) / v.scale, y: (250 - v.y) / v.scale }).toEqual({ x: 200, y: 250 });
    expect(zoomAt(v, { x: 0, y: 0 }, 1, viewport)).toEqual(IDENTITY_VIEW);
  });

  it("pans within bounds", () => {
    const zoomed = { scale: 2, x: -200, y: -250 };
    expect(panView(zoomed, 50, -50, viewport)).toEqual({ scale: 2, x: -150, y: -300 });
    expect(panView(zoomed, 1000, 1000, viewport)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("pinches: scales by finger distance and follows the midpoint", () => {
    const start = { view: IDENTITY_VIEW, a: { x: 150, y: 250 }, b: { x: 250, y: 250 } };
    const spread = pinchView(start, { x: 100, y: 250 }, { x: 300, y: 250 }, viewport);
    expect(spread).toEqual({ scale: 2, x: -200, y: -250 });
    // Same distance, fingers moved left by 50: pure pan (clamped at the edge).
    const moved = pinchView({ view: spread, a: { x: 100, y: 250 }, b: { x: 300, y: 250 } }, { x: 50, y: 250 }, { x: 250, y: 250 }, viewport);
    expect(moved).toEqual({ scale: 2, x: -250, y: -250 });
    // Pinching in past 1x snaps back to the identity view.
    expect(pinchView(start, { x: 190, y: 250 }, { x: 210, y: 250 }, viewport)).toEqual(IDENTITY_VIEW);
  });
});

describe("before/after slider", () => {
  it("maps pointer x to a clamped percentage", () => {
    expect(percentFromPointer(150, { left: 100, width: 200 })).toBe(25);
    expect(percentFromPointer(0, { left: 100, width: 200 })).toBe(0);
    expect(percentFromPointer(999, { left: 100, width: 200 })).toBe(100);
    expect(percentFromPointer(10, { left: 0, width: 0 })).toBe(50);
  });

  it("follows the ARIA slider keyboard pattern", () => {
    expect(sliderKeyValue("ArrowRight", 50)).toBe(52);
    expect(sliderKeyValue("ArrowLeft", 50, true)).toBe(40);
    expect(sliderKeyValue("ArrowUp", 99)).toBe(100);
    expect(sliderKeyValue("PageDown", 5)).toBe(0);
    expect(sliderKeyValue("Home", 70)).toBe(0);
    expect(sliderKeyValue("End", 70)).toBe(100);
    expect(sliderKeyValue("Enter", 70)).toBeNull();
  });
});
