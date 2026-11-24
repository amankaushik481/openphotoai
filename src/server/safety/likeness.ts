/** Likeness of a generated image to an identity (feeds the best-shots picker + likeness guarantee). */
import { cosineSimilarity, isValidEmbedding } from "./embeddings";
import { largestFace } from "./faces";
import { analyzeFaces } from "./providers";

/**
 * 0..1 likeness of the main face in `bytes` to an identity embedding: cosine similarity clamped
 * to [0, 1]. Null when there is no face or the embeddings aren't comparable. Provider errors propagate.
 */
export async function likenessScore(bytes: Uint8Array, embedding: number[]): Promise<number | null> {
  if (!isValidEmbedding(embedding)) return null;
  const { faces } = await analyzeFaces(bytes);
  const main = largestFace(faces);
  if (!main || !isValidEmbedding(main.embedding) || main.embedding.length !== embedding.length) return null;
  return Math.max(0, Math.min(1, cosineSimilarity(embedding, main.embedding)));
}
