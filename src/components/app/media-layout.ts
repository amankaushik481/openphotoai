/** Pure layout math for MediaGrid (unit-tested). */

/** Grid rows per column width: a square tile spans this many rows. */
export const MASONRY_UNITS = 4;
const MIN_SPAN = 2;
const MAX_SPAN = 8;

/**
 * How many grid rows a tile spans so its height tracks the media aspect ratio
 * (rows are 1/MASONRY_UNITS of a column width). Unknown sizes fall back to 4:5 portrait.
 */
export function masonryRowSpan(width: number | null | undefined, height: number | null | undefined): number {
  const ratio = width && height && width > 0 && height > 0 ? height / width : 5 / 4;
  return Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(ratio * MASONRY_UNITS)));
}
