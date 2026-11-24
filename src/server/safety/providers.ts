/**
 * Thin wrappers around the configured safety providers. Everything here is async so a
 * misconfigured registry (which throws synchronously) surfaces as a rejected promise and
 * takes the same fail-closed path as a provider outage.
 */
import { getFaceProvider, getModerationProvider } from "@/providers/registry";
import type { DetectedFace, ModerationResult } from "@/providers/types";
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

export async function analyzeFaces(bytes: Uint8Array): Promise<{ faces: DetectedFace[]; matchThreshold: number }> {
  const provider = getFaceProvider();
  const { faces } = await provider.analyze(bytes);
  if (!Array.isArray(faces)) throw new Error(`face provider "${provider.name}" returned no face list`);
  return { faces, matchThreshold: provider.matchThreshold };
}

export async function faceMatchThreshold(): Promise<number> {
  return getFaceProvider().matchThreshold;
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
