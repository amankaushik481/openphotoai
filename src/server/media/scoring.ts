/**
 * Output scoring + best-shots picker (pure functions, no I/O).
 *
 * Every generated image gets a quality score (technical metrics) and, when the job has an identity
 * model with a consent embedding, a likeness score (face embedding similarity). The picker hides weak
 * outputs by default (users can still "show hidden"), and the likeness guarantee hides + refunds
 * outputs that don't look like the person.
 */
import type { MediaScores } from "@/types/domain";

/** Only jobs with at least this many images get weak outputs hidden. */
export const BEST_SHOTS_MIN_IMAGES = 3;
/** Outputs scoring more than this below the best one are hidden. */
export const BEST_SHOTS_MAX_GAP = 0.25;
/** The top N outputs are never hidden by the picker (likeness guarantee still applies). */
export const BEST_SHOTS_ALWAYS_KEEP = 2;
/** Likeness below this hides the output and refunds its credit. */
export const LIKENESS_GUARANTEE_THRESHOLD = 0.45;

/** Weight of likeness vs. quality in the overall score (when likeness is known). */
export const LIKENESS_WEIGHT = 0.6;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sharpness (variance of Laplacian) at which the sharpness term reaches ~63%. */
const SHARPNESS_SCALE = 250;
/** Contrast (luminance std-dev) considered fully contrasty. */
const CONTRAST_FULL = 55;
/** Comfortable mean-luminance band (0-255). */
const EXPOSURE_LOW = 80;
const EXPOSURE_HIGH = 180;

/** 0..1 technical quality from imageMetrics(). */
export function qualityFromMetrics(m: { sharpness: number; brightness: number; contrast: number }): number {
  const sharp = 1 - Math.exp(-Math.max(0, m.sharpness) / SHARPNESS_SCALE);
  const b = m.brightness;
  const exposure =
    b < EXPOSURE_LOW ? b / EXPOSURE_LOW : b > EXPOSURE_HIGH ? (255 - b) / (255 - EXPOSURE_HIGH) : 1;
  const contrast = m.contrast / CONTRAST_FULL;
  return round3(clamp01(0.5 * clamp01(sharp) + 0.25 * clamp01(exposure) + 0.25 * clamp01(contrast)));
}

export function buildScores(likeness: number | null | undefined, quality: number | null | undefined): MediaScores {
  const q = quality == null ? undefined : round3(clamp01(quality));
  const l = likeness == null ? undefined : round3(clamp01(likeness));
  let overall: number;
  if (l !== undefined && q !== undefined) overall = LIKENESS_WEIGHT * l + (1 - LIKENESS_WEIGHT) * q;
  else overall = l ?? q ?? 0.5;
  return { ...(l !== undefined ? { likeness: l } : {}), ...(q !== undefined ? { quality: q } : {}), overall: round3(overall) };
}

export interface PickDecision {
  hidden: boolean;
  /** True when the likeness guarantee applies (hidden + credit refunded). */
  lowLikeness: boolean;
}

/** Decide which outputs of one job are hidden. Returns one decision per input, in order. */
export function pickBestShots(scores: MediaScores[]): PickDecision[] {
  const decisions: PickDecision[] = scores.map((s) => {
    const lowLikeness = s.likeness !== undefined && s.likeness < LIKENESS_GUARANTEE_THRESHOLD;
    return { hidden: lowLikeness, lowLikeness };
  });
  if (scores.length < BEST_SHOTS_MIN_IMAGES) return decisions;

  const ranked = scores.map((s, i) => ({ i, overall: s.overall })).sort((a, b) => b.overall - a.overall);
  const best = ranked[0]!.overall;
  ranked.forEach(({ i, overall }, rank) => {
    if (rank >= BEST_SHOTS_ALWAYS_KEEP && overall < best - BEST_SHOTS_MAX_GAP) decisions[i]!.hidden = true;
  });
  return decisions;
}
