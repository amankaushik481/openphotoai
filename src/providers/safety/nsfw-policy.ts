/**
 * Pure decision logic for the nsfwjs image classifier (5 softmax classes).
 * OpenShoot forbids sexual AND sexualized content, so besides explicit material (Porn/Hentai)
 * the "Sexy" class blocks too, and so does a high combined mass across the three classes.
 */

export type NsfwClass = "Drawing" | "Hentai" | "Neutral" | "Porn" | "Sexy";
export type NsfwScores = Record<NsfwClass, number>;

/** nsfwjs output order (`nsfw_classes.js`). */
export const NSFW_CLASS_ORDER: readonly NsfwClass[] = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"];

export interface NsfwThresholds {
  /** Block when Porn + Hentai ≥ this. */
  explicit: number;
  /** Block when Sexy ≥ this (sexualized but not explicit). */
  suggestive: number;
  /** Block when Porn + Hentai + Sexy ≥ this (mass split across classes). */
  combined: number;
}

/**
 * Defaults (see docs/SAFETY_PROVIDERS.md). Explicit follows docs/MODELS.md (0.5: benign party
 * photos in human's samples reach 0.43 on thumbnails); "Sexy" is much stricter than MODELS.md's
 * 0.85 because sexualized content is forbidden too. Tighten further, never loosen, when tuning.
 */
export const DEFAULT_NSFW_THRESHOLDS: NsfwThresholds = Object.freeze({
  explicit: 0.5,
  suggestive: 0.6,
  combined: 0.7,
});

export interface NsfwDecision {
  allowed: boolean;
  categories: string[];
  /** Rounded per-class probabilities plus the derived `explicit` and `sexual_total` sums. */
  scores: Record<string, number>;
  reason?: string;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Map a raw probability vector (nsfwjs class order) to named scores. */
export function toNsfwScores(probabilities: ArrayLike<number>): NsfwScores {
  if (probabilities.length !== NSFW_CLASS_ORDER.length) {
    throw new Error(`nsfw: expected ${NSFW_CLASS_ORDER.length} probabilities, got ${probabilities.length}`);
  }
  const out = {} as NsfwScores;
  NSFW_CLASS_ORDER.forEach((name, i) => {
    const p = Number(probabilities[i]);
    if (!Number.isFinite(p)) throw new Error(`nsfw: non-finite probability for ${name}`);
    out[name] = p;
  });
  return out;
}

export function evaluateNsfw(scores: NsfwScores, thresholds: NsfwThresholds = DEFAULT_NSFW_THRESHOLDS): NsfwDecision {
  const explicit = scores.Porn + scores.Hentai;
  const sexualTotal = explicit + scores.Sexy;
  const named: Record<string, number> = {
    porn: r4(scores.Porn),
    hentai: r4(scores.Hentai),
    sexy: r4(scores.Sexy),
    neutral: r4(scores.Neutral),
    drawing: r4(scores.Drawing),
    explicit: r4(explicit),
    sexual_total: r4(sexualTotal),
  };
  let reason: string | undefined;
  if (explicit >= thresholds.explicit) reason = `explicit content (porn+hentai ${explicit.toFixed(2)})`;
  else if (scores.Sexy >= thresholds.suggestive) reason = `sexualized content (sexy ${scores.Sexy.toFixed(2)})`;
  else if (sexualTotal >= thresholds.combined) reason = `sexual content (combined ${sexualTotal.toFixed(2)})`;
  return reason
    ? { allowed: false, categories: ["sexual"], scores: named, reason }
    : { allowed: true, categories: [], scores: named };
}
