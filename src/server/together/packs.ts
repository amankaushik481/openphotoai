/** Packs that read well with two people in the frame (the handler itself accepts any pack). */
import { listPackSummaries } from "@/server/packs/registry";
import type { PackCategory, PackSummary } from "@/types/pack";

/** Solo headshot-style categories: two people in a LinkedIn headshot rarely makes sense. */
const EXCLUDED_CATEGORIES: ReadonlySet<PackCategory> = new Set(["professional"]);
const EXCLUDED_TAGS: ReadonlySet<string> = new Set(["headshot", "dating profile", "magazine cover", "cover star"]);
/** Shown first: packs whose tags suggest company. */
const SOCIAL_TAGS: ReadonlySet<string> = new Set([
  "friends",
  "romantic",
  "celebration",
  "wedding",
  "wedding guest",
  "first date",
  "party",
  "vacation",
  "festive",
]);

export function isTogetherPack(pack: Pick<PackSummary, "category" | "tags">): boolean {
  return !EXCLUDED_CATEGORIES.has(pack.category) && !pack.tags.some((t) => EXCLUDED_TAGS.has(t.toLowerCase()));
}

function socialScore(pack: Pick<PackSummary, "tags">): number {
  return pack.tags.filter((t) => SOCIAL_TAGS.has(t.toLowerCase())).length;
}

export async function listTogetherPacks(): Promise<PackSummary[]> {
  const packs = (await listPackSummaries()).filter(isTogetherPack);
  // Stable sort keeps the registry's own order within equal scores.
  return packs
    .map((p, i) => ({ p, i, s: socialScore(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}
