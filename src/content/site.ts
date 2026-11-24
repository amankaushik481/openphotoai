/** Public route inventory for the sitemap and crawl rules for robots.txt. */
import type { MetadataRoute } from "next";
import { APP } from "@/config/app";

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export interface StaticRoute {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

/** Indexable marketing pages (pack detail pages are added from the pack registry). */
export const STATIC_ROUTES: readonly StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/packs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/docs", changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/api", changeFrequency: "monthly", priority: 0.5 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/acceptable-use", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Never crawled: signed-in app, admin, API, dev tools, private share links and one-time token pages.
 * Share pages (/s/) also send noindex themselves; this keeps crawlers off them entirely.
 */
export const ROBOTS_DISALLOW: readonly string[] = [
  "/app",
  "/admin",
  "/api",
  "/dev",
  "/s/",
  "/verify",
  "/invites/",
  "/teams/join/",
  "/account/",
  "/suspended",
];

/** Absolute URL on the configured public origin. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${APP.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Public URL of a pack page. */
export function packPath(slug: string): string {
  return `/packs/${slug}`;
}

/** Sign-in URL that continues to the in-app pack page. */
export function packSignupHref(slug: string): string {
  return `/login?next=${encodeURIComponent(`/app/packs/${slug}`)}`;
}
