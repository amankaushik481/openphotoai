import { describe, expect, it } from "vitest";

import { pickShowcasePacks } from "@/components/marketing/packs-showcase";
import { packCategoryCounts, packSearchEntry, relatedPacks, searchPacks } from "@/content/packs";
import { buildBreadcrumbJsonLd, buildPackJsonLd, buildPackListJsonLd } from "@/content/structured-data";
import { APP } from "@/config/app";
import { listPackSummaries, listPacks, toPackSummary } from "@/server/packs/registry";
import type { PackCategory, PackSummary } from "@/types/pack";

function summary(slug: string, category: PackCategory, featured = false): PackSummary {
  return {
    slug,
    name: slug,
    tagline: "t",
    description: "d",
    category,
    tags: [],
    featured,
    isNew: false,
    promptCount: 6,
    sampleTitles: [],
  };
}

describe("pack gallery helpers", () => {
  const packs = [
    summary("a", "professional"),
    summary("b", "professional"),
    summary("c", "dating", true),
    summary("d", "travel"),
    summary("e", "professional", true),
  ];

  it("counts packs per non-empty category in canonical order", () => {
    expect(packCategoryCounts(packs)).toEqual([
      { id: "professional", label: "Professional", count: 3 },
      { id: "dating", label: "Dating", count: 1 },
      { id: "travel", label: "Travel", count: 1 },
    ]);
  });

  it("suggests same-category packs first, then featured, never the pack itself", () => {
    expect(relatedPacks(packs[0]!, packs).map((p) => p.slug)).toEqual(["b", "e", "c", "d"]);
    expect(relatedPacks(packs[0]!, packs, 2).map((p) => p.slug)).toEqual(["b", "e"]);
  });

  it("shows featured packs first in the landing showcase", () => {
    expect(pickShowcasePacks(packs, 3).map((p) => p.slug)).toEqual(["c", "e", "a"]);
  });

  it("category counts add up for the real pack catalogue", async () => {
    const real = await listPackSummaries();
    expect(packCategoryCounts(real).reduce((n, c) => n + c.count, 0)).toBe(real.length);
  });
});

describe("pack gallery search", () => {
  const entries = [
    packSearchEntry({
      ...summary("linkedin-headshots", "professional"),
      name: "LinkedIn Headshots",
      tagline: "Recruiter-ready",
      tags: ["corporate"],
    }),
    packSearchEntry({ ...summary("paris", "travel"), name: "Paris", tagline: "Café terraces", sampleTitles: ["Eiffel Tower at dusk"] }),
    packSearchEntry({ ...summary("beach", "travel"), name: "Beach Resort", tagline: "Sun and sea" }),
  ];
  const slugs = (q: string) => {
    const r = searchPacks(entries, q);
    return r === null ? null : [...r].sort();
  };

  it("matches name, tagline, category, tags and shot titles, ignoring case, accents and plurals", () => {
    expect(slugs("headshot")).toEqual(["linkedin-headshots"]);
    expect(slugs("HEADSHOTS")).toEqual(["linkedin-headshots"]);
    expect(slugs("cafe")).toEqual(["paris"]);
    expect(slugs("eiffel")).toEqual(["paris"]);
    expect(slugs("corporate")).toEqual(["linkedin-headshots"]);
    expect(slugs("travel")).toEqual(["beach", "paris"]);
    expect(slugs("professional")).toEqual(["linkedin-headshots"]);
  });

  it("requires every word to match", () => {
    expect(slugs("travel sea")).toEqual(["beach"]);
    expect(slugs("travel  linkedin")).toEqual([]);
    expect(slugs("zzz")).toEqual([]);
  });

  it("an empty or punctuation-only query means no filter", () => {
    expect(slugs("")).toBeNull();
    expect(slugs("   ")).toBeNull();
    expect(slugs(" ,. ")).toBeNull();
  });

  it("the real catalogue finds headshot packs", async () => {
    const real = (await listPackSummaries()).map(packSearchEntry);
    expect(searchPacks(real, "headshot")?.has("linkedin-headshots")).toBe(true);
  });
});

describe("pack structured data", () => {
  it("lists every pack page in the gallery ItemList", async () => {
    const real = await listPackSummaries();
    const ld = buildPackListJsonLd(real);
    expect(ld["@type"]).toBe("ItemList");
    const items = ld.itemListElement as { position: number; url: string }[];
    expect(items).toHaveLength(real.length);
    expect(items[0]).toMatchObject({ position: 1, url: `${APP.url}/packs/${real[0]!.slug}` });
  });

  it("describes a pack with its full shot list", async () => {
    const [pack] = await listPacks();
    const ld = buildPackJsonLd(pack!);
    const part = ld.hasPart as { numberOfItems: number; itemListElement: { name: string }[] };
    expect(part.numberOfItems).toBe(pack!.prompts.length);
    expect(part.itemListElement.map((i) => i.name)).toEqual(pack!.prompts.map((p) => p.title));
    expect(toPackSummary(pack!).promptCount).toBe(pack!.prompts.length);
  });

  it("numbers breadcrumbs from 1 with absolute URLs", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Packs", path: "/packs" },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${APP.url}/` },
      { "@type": "ListItem", position: 2, name: "Packs", item: `${APP.url}/packs` },
    ]);
  });
});
