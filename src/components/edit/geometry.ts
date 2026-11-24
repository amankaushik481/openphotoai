/**
 * Pure helpers for the mask painter and the before/after slider (no DOM, no React; unit-tested).
 *
 * Coordinate spaces:
 *  - client: pointer event clientX/clientY.
 *  - viewport: px relative to the painter's (untransformed) viewport box; zoom/pan lives here.
 *  - canvas: px of the working mask canvas (the photo's natural size, capped).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/* ───────────── sizes ───────────── */

/** Scale `size` down (never up) so its longest side is at most `maxSide`; integer pixels, at least 1. */
export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/* ───────────── pointer → canvas ───────────── */

/**
 * Map a pointer position to canvas pixels. `rect` is the canvas's on-screen box from getBoundingClientRect(),
 * which already includes CSS zoom/pan transforms, so this works at any zoom level.
 */
export function clientToCanvas(clientX: number, clientY: number, rect: Rect, canvas: Size): Point {
  return {
    x: ((clientX - rect.left) / Math.max(1e-6, rect.width)) * canvas.width,
    y: ((clientY - rect.top) / Math.max(1e-6, rect.height)) * canvas.height,
  };
}

/** Convert a length in screen px (e.g. the brush diameter) to canvas px at the canvas's current on-screen size. */
export function screenToCanvasLength(length: number, rectWidth: number, canvasWidth: number): number {
  return (length / Math.max(1e-6, rectWidth)) * canvasWidth;
}

/* ───────────── strokes ───────────── */

export type StrokeMode = "paint" | "erase";

export interface Stroke {
  mode: StrokeMode;
  /** Brush diameter in canvas px. */
  size: number;
  /** Raw pointer samples in canvas px. */
  points: Point[];
}

/** Distance between dabs: a quarter of the brush diameter (at least 1px) keeps edges smooth. */
export function dabSpacing(size: number): number {
  return Math.max(1, size / 4);
}

/**
 * Evenly spaced points from `from` (exclusive) to `to` (inclusive), at most `spacing` apart, so fast pointer
 * moves still paint a continuous line of dabs. Returns [] when the points coincide.
 */
export function interpolateStroke(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [];
  const steps = Math.ceil(dist / Math.max(spacing, 1e-3));
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) out.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps });
  return out;
}

/** Every dab centre of a stroke (first sample + interpolated segments). */
export function strokeDabs(stroke: Stroke): Point[] {
  const [first, ...rest] = stroke.points;
  if (!first) return [];
  const spacing = dabSpacing(stroke.size);
  const dabs: Point[] = [first];
  let prev = first;
  for (const p of rest) {
    dabs.push(...interpolateStroke(prev, p, spacing));
    prev = p;
  }
  return dabs;
}

/* ───────────── undo / redo history ───────────── */

export type MaskAction = { kind: "stroke"; stroke: Stroke } | { kind: "clear" };

export interface MaskHistory {
  done: readonly MaskAction[];
  undone: readonly MaskAction[];
}

export const EMPTY_HISTORY: MaskHistory = { done: [], undone: [] };

/** Record an action; a new action discards the redo stack. */
export function pushAction(history: MaskHistory, action: MaskAction): MaskHistory {
  return { done: [...history.done, action], undone: [] };
}

export function undoAction(history: MaskHistory): MaskHistory {
  const last = history.done.at(-1);
  if (!last) return history;
  return { done: history.done.slice(0, -1), undone: [...history.undone, last] };
}

export function redoAction(history: MaskHistory): MaskHistory {
  const next = history.undone.at(-1);
  if (!next) return history;
  return { done: [...history.done, next], undone: history.undone.slice(0, -1) };
}

/** Strokes to replay onto a blank canvas: everything after the last "clear". */
export function visibleStrokes(done: readonly MaskAction[]): Stroke[] {
  const out: Stroke[] = [];
  for (const action of done) {
    if (action.kind === "clear") out.length = 0;
    else out.push(action.stroke);
  }
  return out;
}

/** Whether anything is painted (approximate: erasing everything still counts; export re-checks the pixels). */
export function hasPaint(done: readonly MaskAction[]): boolean {
  return visibleStrokes(done).some((s) => s.mode === "paint" && s.points.length > 0);
}

/* ───────────── export ───────────── */

/**
 * Turn RGBA canvas pixels into an opaque black/white mask in place: alpha ≥ `threshold` → white (repaint),
 * else black (keep). Returns the number of white pixels.
 */
export function binarizeMask(data: Uint8ClampedArray, threshold = 128): number {
  let white = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i + 3]! >= threshold ? 255 : 0;
    if (v) white++;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return white;
}

/* ───────────── zoom / pan ───────────── */

/** Content transform: `translate(x, y) scale(scale)` with origin at the top-left of the viewport. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY_VIEW: View = { scale: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Keep the zoom in range and the (scaled) photo covering the viewport, so it can't be dragged away. */
export function clampView(view: View, viewport: Size): View {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  return {
    scale,
    x: clamp(view.x, viewport.width - viewport.width * scale, 0),
    y: clamp(view.y, viewport.height - viewport.height * scale, 0),
  };
}

/** Zoom to `scale` keeping the content under `anchor` (viewport px) fixed on screen. */
export function zoomAt(view: View, anchor: Point, scale: number, viewport: Size): View {
  const next = clamp(scale, MIN_ZOOM, MAX_ZOOM);
  const cx = (anchor.x - view.x) / view.scale;
  const cy = (anchor.y - view.y) / view.scale;
  return clampView({ scale: next, x: anchor.x - next * cx, y: anchor.y - next * cy }, viewport);
}

export function panView(view: View, dx: number, dy: number, viewport: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, viewport);
}

export interface PinchStart {
  view: View;
  a: Point;
  b: Point;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Two-finger pinch: scale by the change in finger distance, and move so the content that was under the
 * fingers' starting midpoint follows their current midpoint (zoom + pan in one gesture).
 */
export function pinchView(start: PinchStart, a: Point, b: Point, viewport: Size): View {
  const d0 = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  const d1 = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = clamp(start.view.scale * (d0 > 0 ? d1 / d0 : 1), MIN_ZOOM, MAX_ZOOM);
  const m0 = midpoint(start.a, start.b);
  const m1 = midpoint(a, b);
  const cx = (m0.x - start.view.x) / start.view.scale;
  const cy = (m0.y - start.view.y) / start.view.scale;
  return clampView({ scale, x: m1.x - scale * cx, y: m1.y - scale * cy }, viewport);
}

/* ───────────── before/after slider ───────────── */

/** Slider position (0-100) for a pointer at `clientX` over `rect`. */
export function percentFromPointer(clientX: number, rect: Pick<Rect, "left" | "width">): number {
  if (rect.width <= 0) return 50;
  return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
}

/** Next slider value for a key press (ARIA slider pattern), or null for keys the slider doesn't handle. */
export function sliderKeyValue(key: string, value: number, coarse = false): number | null {
  const step = coarse ? 10 : 2;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(value - step, 0, 100);
    case "ArrowRight":
    case "ArrowUp":
      return clamp(value + step, 0, 100);
    case "PageDown":
      return clamp(value - 10, 0, 100);
    case "PageUp":
      return clamp(value + 10, 0, 100);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}
