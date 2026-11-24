/** Face-embedding math used for consent matching and likeness scoring. */

/** True for a non-empty array of finite numbers that is not all zeros. */
export function isValidEmbedding(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => typeof x === "number" && Number.isFinite(x)) &&
    v.some((x) => x !== 0)
  );
}

function norm(v: readonly number[]): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

/** Unit-length copy of `v` (a zero vector is returned unchanged). */
export function l2normalize(v: readonly number[]): number[] {
  const n = norm(v);
  return n === 0 ? [...v] : v.map((x) => x / n);
}

/**
 * Cosine similarity in [-1, 1]. Throws when dimensions differ (embeddings from different face
 * providers are not comparable — callers must treat that as "no match").
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`embedding dimension mismatch (${a.length} vs ${b.length})`);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, dot / denom));
}

/** L2-normalized mean of several embeddings of the same dimension. */
export function meanEmbedding(vectors: readonly (readonly number[])[]): number[] {
  if (vectors.length === 0) throw new Error("meanEmbedding needs at least one vector");
  const dim = vectors[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error(`embedding dimension mismatch (${dim} vs ${v.length})`);
    const unit = l2normalize(v);
    for (let i = 0; i < dim; i++) sum[i] += unit[i];
  }
  return l2normalize(sum);
}
