import type { Metadata } from "next";
import { describe, expect, it } from "vitest";

import { metadata as apiDocsMeta } from "@/app/(marketing)/docs/api/page";
import { metadata as docsMeta } from "@/app/(marketing)/docs/page";
import { metadata as faqMeta } from "@/app/(marketing)/faq/page";
import { metadata as acceptableUseMeta } from "@/app/(marketing)/legal/acceptable-use/page";
import { metadata as legalMeta } from "@/app/(marketing)/legal/page";
import { metadata as privacyMeta } from "@/app/(marketing)/legal/privacy/page";
import { metadata as termsMeta } from "@/app/(marketing)/legal/terms/page";
import { metadata as homeMeta } from "@/app/(marketing)/page";
import { generateMetadata as packMeta } from "@/app/(marketing)/packs/[slug]/page";
import { generateMetadata as packsMeta } from "@/app/(marketing)/packs/page";
import { metadata as pricingMeta } from "@/app/(marketing)/pricing/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { APP } from "@/config/app";
import { ROBOTS_DISALLOW, STATIC_ROUTES, absoluteUrl, packSignupHref } from "@/content/site";
import { listPacks } from "@/server/packs/registry";

describe("marketing page metadata", () => {
  const titleText = (m: Metadata) =>
    typeof m.title === "string" ? m.title : (m.title as { absolute?: string; default?: string }).absolute;

  it.each([
    ["/", () => homeMeta],
    ["/pricing", () => pricingMeta],
    ["/packs", () => packsMeta()],
    ["/packs/linkedin-headshots", () => packMeta({ params: Promise.resolve({ slug: "linkedin-headshots" }) })],
    ["/faq", () => faqMeta],
    ["/docs", () => docsMeta],
    ["/docs/api", () => apiDocsMeta],
    ["/legal", () => legalMeta],
    ["/legal/terms", () => termsMeta],
    ["/legal/privacy", () => privacyMeta],
    ["/legal/acceptable-use", () => acceptableUseMeta],
  ])("%s has its own canonical, og:url, og:title and description (not the home page's)", async (path, get) => {
    const m = await get();
    const title = titleText(m);
    expect(title).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.alternates?.canonical).toBe(path);
    expect(m.openGraph?.url).toBe(path);
    expect(m.openGraph?.title).toContain(title!);
    expect(m.openGraph?.description).toBe(m.description);
    expect(m.openGraph?.siteName).toBe(APP.name);
    expect(m.twitter?.title).toBe(m.openGraph?.title);
    if (path !== "/") expect(m.openGraph?.description).not.toBe(APP.description);
    // A page-level openGraph drops the root opengraph-image: reference it, except where the segment has its own.
    const images = JSON.stringify([m.openGraph?.images, m.twitter?.images]);
    if (path.startsWith("/packs/")) expect(m.openGraph?.images).toBeUndefined();
    else expect(images).toMatch(/"url":"\/opengraph-image".*"url":"\/twitter-image"/);
  });
});

describe("sitemap", () => {
  it("lists every static marketing route and every pack as absolute URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    const packs = await listPacks();

    expect(packs.length).toBeGreaterThan(0);
    for (const route of [
      "/",
      "/pricing",
      "/packs",
      "/faq",
      "/legal/terms",
      "/legal/privacy",
      "/legal/acceptable-use",
    ]) {
      expect(urls).toContain(absoluteUrl(route));
    }
    for (const r of STATIC_ROUTES) expect(urls).toContain(`${APP.url}${r.path}`);
    for (const p of packs) expect(urls).toContain(`${APP.url}/packs/${p.slug}`);

    expect(entries).toHaveLength(STATIC_ROUTES.length + packs.length);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith(APP.url)).toBe(true);
  });

  it("never includes private or app routes", async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    for (const path of urls) {
      for (const prefix of ["/app", "/admin", "/api/", "/dev", "/s/"]) expect(path.startsWith(prefix)).toBe(false);
    }
  });

  it("gives every entry a priority between 0 and 1 and a change frequency", async () => {
    for (const e of await sitemap()) {
      expect(e.priority).toBeGreaterThan(0);
      expect(e.priority).toBeLessThanOrEqual(1);
      expect(e.changeFrequency).toBeTruthy();
    }
  });
});

describe("robots", () => {
  it("allows the site but disallows app, admin, api, dev and share links", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    for (const path of ["/app", "/admin", "/api", "/dev", "/s/"]) expect(disallow).toContain(path);
    expect(disallow).toEqual([...ROBOTS_DISALLOW]);
  });

  it("points crawlers at the sitemap on the configured origin", () => {
    expect(robots().sitemap).toBe(`${APP.url}/sitemap.xml`);
  });

  it("does not block any page that is in the sitemap", async () => {
    const paths = (await sitemap()).map((e) => new URL(e.url).pathname);
    for (const path of paths) {
      expect(ROBOTS_DISALLOW.some((d) => path.startsWith(d))).toBe(false);
    }
  });
});

describe("site helpers", () => {
  it("builds absolute URLs without double slashes", () => {
    expect(absoluteUrl("/pricing")).toBe(`${APP.url}/pricing`);
    expect(absoluteUrl("pricing")).toBe(`${APP.url}/pricing`);
    expect(absoluteUrl("https://example.org/x")).toBe("https://example.org/x");
  });

  it("sends 'Use this pack' through sign-in to the in-app pack page", () => {
    const href = packSignupHref("linkedin-headshots");
    const url = new URL(href, "http://x.invalid");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/app/packs/linkedin-headshots");
  });
});
