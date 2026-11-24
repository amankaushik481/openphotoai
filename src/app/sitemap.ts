import type { MetadataRoute } from "next";

import { STATIC_ROUTES, absoluteUrl, packPath } from "@/content/site";
import { listPackSummaries } from "@/server/packs/registry";

/** Static marketing pages + one entry per pack (generated at build time). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const packs = await listPackSummaries();
  return [
    ...STATIC_ROUTES.map((r) => ({
      url: absoluteUrl(r.path),
      lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...packs.map((p) => ({
      url: absoluteUrl(packPath(p.slug)),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: p.featured ? 0.8 : 0.7,
    })),
  ];
}
