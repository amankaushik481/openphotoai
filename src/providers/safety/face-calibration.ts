/**
 * Pure statistics for calibrating a face `matchThreshold` from labeled embeddings
 * (used by scripts/calibrate-face.ts; no I/O, no tfjs).
 */
import { cosineSimilarity } from "./face-math";

export interface LabeledEmbedding {
  /** Identity label (e.g. the folder name). */
  label: string;
  /** Source of the sample, for reporting. */
  source: string;
  embedding: number[];
}

export interface PairScores {
  same: number[];
  different: number[];
}

/** Cosine similarity of every unordered pair, split into same-identity and different-identity. */
export function pairScores(samples: LabeledEmbedding[]): PairScores {
  const same: number[] = [];
  const different: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const s = cosineSimilarity(samples[i].embedding, samples[j].embedding);
      (samples[i].label === samples[j].label ? same : different).push(s);
    }
  }
  return { same, different };
}

/** Linear-interpolated quantile (q in [0,1]) of an unsorted sample. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Distribution {
  n: number;
  min: number;
  p01: number;
  p05: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  p99: number;
  max: number;
}

export function describe(values: number[]): Distribution {
  return {
    n: values.length,
    min: quantile(values, 0),
    p01: quantile(values, 0.01),
    p05: quantile(values, 0.05),
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    max: quantile(values, 1),
  };
}

export interface ThresholdRow {
  threshold: number;
  /** Same-person pairs rejected (score < threshold) / all same-person pairs. */
  falseRejectRate: number;
  /** Different-person pairs accepted (score ≥ threshold) / all different-person pairs. */
  falseAcceptRate: number;
}

export function errorRates(scores: PairScores, threshold: number): ThresholdRow {
  const frr = scores.same.length ? scores.same.filter((s) => s < threshold).length / scores.same.length : Number.NaN;
  const far = scores.different.length
    ? scores.different.filter((s) => s >= threshold).length / scores.different.length
    : Number.NaN;
  return { threshold, falseRejectRate: frr, falseAcceptRate: far };
}

/** Error rates on a regular grid of thresholds (inclusive). */
export function thresholdTable(scores: PairScores, from = 0.3, to = 0.9, step = 0.025): ThresholdRow[] {
  const rows: ThresholdRow[] = [];
  for (let t = from; t <= to + 1e-9; t += step) rows.push(errorRates(scores, Math.round(t * 1000) / 1000));
  return rows;
}

/** Lowest threshold whose false-accept rate is ≤ `maxFar` (null when no candidate qualifies). */
export function thresholdForFar(scores: PairScores, maxFar: number): number | null {
  if (scores.different.length === 0) return null;
  const candidates = [...new Set([...scores.same, ...scores.different])].sort((a, b) => a - b);
  // Just above each different-pair score is where FAR steps down.
  for (const c of [...candidates, 1]) {
    const t = Math.min(1, c + 1e-6);
    if (errorRates(scores, t).falseAcceptRate <= maxFar) return Math.round(t * 1000) / 1000;
  }
  return null;
}

/** Threshold where FAR and FRR are closest (equal error rate), searched on a 0.001 grid. */
export function equalErrorRate(scores: PairScores): { threshold: number; rate: number } | null {
  if (scores.same.length === 0 || scores.different.length === 0) return null;
  let best = { threshold: 0, rate: 1, gap: Number.POSITIVE_INFINITY };
  for (let t = 0; t <= 1.0005; t += 0.001) {
    const r = errorRates(scores, t);
    const gap = Math.abs(r.falseAcceptRate - r.falseRejectRate);
    if (gap < best.gap) best = { threshold: t, rate: (r.falseAcceptRate + r.falseRejectRate) / 2, gap };
  }
  return { threshold: Math.round(best.threshold * 1000) / 1000, rate: best.rate };
}
