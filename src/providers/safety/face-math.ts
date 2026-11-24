/** Pure helpers for face embeddings and pose (no tfjs). */

/** Return a unit-length copy of `v`. A zero vector stays zero. */
export function l2Normalize(v: ArrayLike<number>): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = norm > 0 ? v[i] / norm : 0;
  return out;
}

/** Cosine similarity in [-1, 1]. Works for normalized and raw vectors. Throws on length mismatch. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Round to `digits` decimals (keeps payloads small and deterministic in logs). */
export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
