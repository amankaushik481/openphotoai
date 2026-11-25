/** Viewer gestures and navigation focus (pure; unit-tested). */

export type NavDirection = "prev" | "next";

/** Minimum horizontal travel (px) for a swipe, and the longest a swipe may take. */
export const SWIPE_MIN_PX = 60;
export const SWIPE_MAX_MS = 700;

/**
 * A finished touch gesture → previous/next photo, or null. Mostly horizontal, far enough and quick
 * enough; swiping left moves to the next (older) photo, like turning a page.
 */
export function swipeDirection(g: { dx: number; dy: number; ms: number }): NavDirection | null {
  if (g.ms > SWIPE_MAX_MS || Math.abs(g.dx) < SWIPE_MIN_PX || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return null;
  return g.dx < 0 ? "next" : "prev";
}

export const ZOOM_SCALE = 2.5;

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

/** Furthest a zoomed image may move from center before showing empty space (per axis). */
function limit(size: number, scale: number): number {
  return Math.max(0, ((scale - 1) * size) / 2);
}

/** Keep a zoomed image covering its frame. */
export function clampPan(z: Zoom, size: { width: number; height: number }): Zoom {
  const lx = limit(size.width, z.scale);
  const ly = limit(size.height, z.scale);
  // `+ 0` turns -0 into 0.
  return { scale: z.scale, x: Math.min(lx, Math.max(-lx, z.x)) + 0, y: Math.min(ly, Math.max(-ly, z.y)) + 0 };
}

/**
 * Zoom in on the point (relative to the image's top-left) the user double-clicked or double-tapped, so
 * that point stays under the pointer (the transform's origin is the image center).
 */
export function zoomAt(point: { x: number; y: number }, size: { width: number; height: number }, scale = ZOOM_SCALE): Zoom {
  const dx = point.x - size.width / 2;
  const dy = point.y - size.height / 2;
  return clampPan({ scale, x: dx * (1 - scale), y: dy * (1 - scale) }, size);
}

/**
 * Prev/next replace the viewer (Next keys the page by its id), so the focused arrow button is
 * recreated: remember which one was used and focus it again on the new photo.
 */
let pendingNavFocus: NavDirection | null = null;

export function requestNavFocus(direction: NavDirection | null): void {
  pendingNavFocus = direction;
}

export function takeNavFocus(): NavDirection | null {
  const d = pendingNavFocus;
  pendingNavFocus = null;
  return d;
}
