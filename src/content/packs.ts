/** Marketing copy + helpers for the public pack gallery. */
import { PACK_CATEGORIES, type PackCategory, type PackSummary } from "@/types/pack";

export const PACK_CATEGORY_INFO: Record<PackCategory, { label: string; blurb: string }> = {
  professional: { label: "Professional", blurb: "Headshots for LinkedIn, résumés, press and company pages." },
  dating: { label: "Dating", blurb: "Natural, flattering photos that still look like you." },
  lifestyle: { label: "Lifestyle", blurb: "Everyday moments with great light: cafés, city walks, home." },
  travel: { label: "Travel", blurb: "Iconic destinations without the flight." },
  fashion: { label: "Fashion", blurb: "Editorial looks, streetwear and quiet luxury." },
  fitness: { label: "Fitness", blurb: "Athletic and active shots for sport and wellness." },
  events: { label: "Events", blurb: "Speaker, conference and occasion photos." },
  seasonal: { label: "Seasonal", blurb: "Holidays and seasons, ready when you are." },
  creative: { label: "Creative", blurb: "Cinematic, retro and fantasy styles." },
  family: { label: "Family", blurb: "Warm portraits for the people you love." },
};

export interface PackCategoryCount {
  id: PackCategory;
  label: string;
  count: number;
}

/** Categories that have at least one pack, in canonical order, with counts. */
export function packCategoryCounts(packs: readonly PackSummary[]): PackCategoryCount[] {
  return PACK_CATEGORIES.map((id) => ({
    id,
    label: PACK_CATEGORY_INFO[id].label,
    count: packs.filter((p) => p.category === id).length,
  })).filter((c) => c.count > 0);
}

/** What the public gallery's search box matches a pack against. */
export interface PackSearchEntry {
  slug: string;
  category: PackCategory;
  /** Normalized name, tagline, category, tags and sample shot titles. */
  text: string;
}

/** Lowercase, accent-free ("Café" matches "cafe"). */
export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

export function packSearchEntry(p: PackSummary): PackSearchEntry {
  const text = [p.name, p.tagline, PACK_CATEGORY_INFO[p.category].label, ...p.tags, ...p.sampleTitles].join(" ");
  return { slug: p.slug, category: p.category, text: normalizeSearchText(text).replace(/\s+/g, " ") };
}

/**
 * Slugs of the packs matching every word of `query` (null for an empty query, i.e. no filter).
 * Words match anywhere in a word ("head" → "headshots"); a trailing plural "s" is ignored.
 */
export function searchPacks(entries: readonly PackSearchEntry[], query: string): Set<string> | null {
  const terms = normalizeSearchText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
  if (terms.length === 0) return null;
  return new Set(entries.filter((e) => terms.every((t) => e.text.includes(t))).map((e) => e.slug));
}

/**
 * Packs to suggest from a pack page: same category first, then featured, then the rest.
 * Never includes the pack itself.
 */
export function relatedPacks(
  pack: Pick<PackSummary, "slug" | "category">,
  all: readonly PackSummary[],
  limit = 4,
): PackSummary[] {
  const others = all.filter((p) => p.slug !== pack.slug);
  const sameCategory = others.filter((p) => p.category === pack.category);
  const featured = others.filter((p) => p.category !== pack.category && p.featured);
  const rest = others.filter((p) => p.category !== pack.category && !p.featured);
  return [...sameCategory, ...featured, ...rest].slice(0, limit);
}
