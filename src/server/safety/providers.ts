/**
 * Thin wrappers around the configured safety providers. Everything here is async so a
 * misconfigured registry (which throws synchronously) surfaces as a rejected promise and
 * takes the same fail-closed path as a provider outage.
 */
import { createHash } from "node:crypto";
import { getFaceProvider, getModerationProvider } from "@/providers/registry";
import type { DetectedFace, FaceProvider, ModerationResult } from "@/providers/types";
import type { ModerationSnapshot } from "@/types/domain";
import { hasHardBlockCategory } from "./policy";

export interface Classification {
  result: ModerationResult;
  /** Final verdict: blocked when the provider says so OR it reports a sexual/minors category. */
  blocked: boolean;
  categories: string[];
  providerName: string;
}

export async function moderateImage(bytes: Uint8Array): Promise<Classification> {
  const provider = getModerationProvider();
  const result = await provider.checkImage(bytes);
  return toClassification(result, provider.name);
}

export async function moderateText(text: string): Promise<Classification> {
  const provider = getModerationProvider();
  const result = await provider.checkText(text);
  return toClassification(result, provider.name);
}

function toClassification(result: ModerationResult, fallbackName: string): Classification {
  const categories = Array.isArray(result.categories) ? result.categories.map(String) : [];
  const blocked = result.allowed !== true || hasHardBlockCategory(categories);
  return {
    result,
    blocked,
    categories: blocked && categories.length === 0 ? ["other"] : categories,
    providerName: result.provider || fallbackName,
  };
}

export interface FaceAnalysis {
  faces: DetectedFace[];
  matchThreshold: number;
}

/**
 * Recent analyses per provider instance, keyed by content hash: the output age gate and likeness
 * scoring analyze the same generated image back to back. Small and short-lived on purpose.
 */
const FACE_CACHE_SIZE = 16;
const FACE_CACHE_TTL_MS = 10_000;
const faceCache = new WeakMap<object, Map<string, { at: number; value: Promise<FaceAnalysis> }>>();

export async function analyzeFaces(bytes: Uint8Array): Promise<FaceAnalysis> {
  const provider = getFaceProvider();
  const key = createHash("sha256").update(bytes).digest("hex");
  let cache = faceCache.get(provider);
  if (!cache) faceCache.set(provider, (cache = new Map()));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FACE_CACHE_TTL_MS) return hit.value;

  const value = (async (): Promise<FaceAnalysis> => {
    const { faces } = await provider.analyze(bytes);
    if (!Array.isArray(faces)) throw new Error(`face provider "${provider.name}" returned no face list`);
    return { faces, matchThreshold: provider.matchThreshold };
  })();
  cache.set(key, { at: Date.now(), value });
  // Errors are never cached (the next call retries); the oldest entry is evicted first.
  value.catch(() => cache.delete(key));
  while (cache.size > FACE_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return value;
}

export async function faceMatchThreshold(): Promise<number> {
  return getFaceProvider().matchThreshold;
}

export async function faceProviderName(): Promise<string> {
  return getFaceProvider().name;
}

type CompareFaces = (source: Uint8Array, target: Uint8Array) => Promise<{ similarity: number | null }>;

/** The face provider's 1:1 comparison (Rekognition CompareFaces: similarity 0..1), or null when it has none. */
export async function faceComparator(): Promise<CompareFaces | null> {
  const provider = getFaceProvider() as FaceProvider & { compareFaces?: CompareFaces };
  return typeof provider.compareFaces === "function" ? (source, target) => provider.compareFaces!(source, target) : null;
}

/** Celebrity recognition when the moderation provider supports it; null when it does not. */
export async function detectPublicFigure(
  bytes: Uint8Array,
): Promise<{ isPublicFigure: boolean; name?: string; confidence?: number } | null> {
  const provider = getModerationProvider();
  if (typeof provider.detectPublicFigure !== "function") return null;
  return provider.detectPublicFigure(bytes);
}

export async function moderationProviderName(): Promise<string> {
  try {
    return getModerationProvider().name;
  } catch {
    return "unavailable";
  }
}

export function snapshot(c: Pick<Classification, "blocked" | "categories" | "providerName">): ModerationSnapshot {
  return { checkedAt: new Date().toISOString(), provider: c.providerName, allowed: !c.blocked, categories: c.categories };
}

export function failedSnapshot(providerName: string): ModerationSnapshot {
  return { checkedAt: new Date().toISOString(), provider: providerName, allowed: false, categories: ["moderation_error"] };
}
