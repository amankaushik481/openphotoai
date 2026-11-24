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
