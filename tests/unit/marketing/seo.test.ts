import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { APP } from "@/config/app";
import { ROBOTS_DISALLOW, STATIC_ROUTES, absoluteUrl, packSignupHref } from "@/content/site";
import { listPacks } from "@/server/packs/registry";

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
