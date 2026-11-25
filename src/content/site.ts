/** Public route inventory for the sitemap, crawl rules for robots.txt and per-page social metadata. */
import type { Metadata, MetadataRoute } from "next";
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
  { path: "/legal", changeFrequency: "yearly", priority: 0.3 },
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

export interface MarketingMetadataInput {
  /** Page title; the root layout's template appends the app name (`Pricing · OpenShoot`). */
  title: string;
  description: string;
  /** Canonical path, also used as og:url. */
  path: string;
  /** Use the title as-is, without the template (the home page). */
  absoluteTitle?: boolean;
  keywords?: string[];
  /** The page's segment has its own `opengraph-image` file (pack pages): don't reference the site-wide card. */
  ownShareImage?: boolean;
}

/** The site-wide share card (`app/opengraph-image.tsx` / `app/twitter-image.tsx`). */
const DEFAULT_SHARE_IMAGE = { width: 1200, height: 630, alt: `${APP.name} — ${APP.tagline}` } as const;

/**
 * Metadata for an indexable marketing page: title, description, canonical URL and Open Graph / Twitter
 * tags that match them. Next.js replaces (doesn't merge) `openGraph` per page, so a page that only set
 * `title` was shared with the home page's og:title, og:description and og:url. A page-level `openGraph`
 * also drops the root `opengraph-image`, so the site-wide card is referenced explicitly, unless the page's
 * own segment has an `opengraph-image` file (which then wins over these tags).
 */
export function marketingMetadata({
  title,
  description,
  path,
  absoluteTitle,
  keywords,
  ownShareImage,
}: MarketingMetadataInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${APP.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: APP.name,
      locale: "en_US",
      url: path,
      title: socialTitle,
      description,
      ...(ownShareImage ? {} : { images: [{ url: "/opengraph-image", ...DEFAULT_SHARE_IMAGE }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      ...(ownShareImage ? {} : { images: [{ url: "/twitter-image", ...DEFAULT_SHARE_IMAGE }] }),
    },
  };
}
