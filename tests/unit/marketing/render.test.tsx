/**
 * Smoke-renders the marketing pages to static HTML (no Next runtime): catches runtime errors in server
 * components and checks basic document structure (one h1, key CTAs, structured data).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FaqPage from "@/app/(marketing)/faq/page";
import AcceptableUsePage from "@/app/(marketing)/legal/acceptable-use/page";
import PrivacyPage from "@/app/(marketing)/legal/privacy/page";
import TermsPage from "@/app/(marketing)/legal/terms/page";
import HomePage from "@/app/(marketing)/page";
import PackPage, { generateStaticParams } from "@/app/(marketing)/packs/[slug]/page";
import PacksPage from "@/app/(marketing)/packs/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import DocsPage from "@/app/(marketing)/docs/page";
import { APP } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";
import { listPacks } from "@/server/packs/registry";

function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

function jsonLd(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
}

describe("marketing pages render", () => {
  it("landing page: one h1, both hero CTAs, packs and structured data", async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain("Your AI photographer.");
    expect(html).toContain('href="/login"');
    expect(html).toContain(`href="${APP.githubUrl}"`);
    expect(html).toContain("Typical AI photo apps");
    const packs = await listPacks();
    expect(html).toContain(`href="/packs/${packs.find((p) => p.featured)?.slug ?? packs[0]!.slug}"`);
    expect(jsonLd(html).length).toBeGreaterThan(0);
  });

  it("pricing page: credit table rows and both billing intervals", () => {
    const html = renderToStaticMarkup(<PricingPage />);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    for (const key of Object.keys(CREDIT_COSTS)) expect(html).toContain(`data-cost-key="${key}"`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Monthly");
  });

  it("faq page: FAQPage JSON-LD and native accordions", () => {
    const html = renderToStaticMarkup(<FaqPage />);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain("<details");
    const ld = jsonLd(html) as { "@type": string }[];
    expect(ld.some((d) => d["@type"] === "FAQPage")).toBe(true);
  });

  it.each([
    ["terms", TermsPage],
    ["privacy", PrivacyPage],
    ["acceptable-use", AcceptableUsePage],
  ])("legal/%s: template notice, operator details, no raw placeholders", (_slug, Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain("have a lawyer review before launch");
    expect(html).toContain(APP.legalEntity);
    expect(html).not.toContain("{{");
  });

  it("packs gallery: every pack card, tagged with its category", async () => {
    const html = renderToStaticMarkup(await PacksPage());
    const packs = await listPacks();
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    for (const p of packs) {
      expect(html).toContain(`href="/packs/${p.slug}"`);
      expect(html).toContain(`data-category="${p.category}"`);
    }
  });

  it("pack detail: every static param renders with shot list and sign-in CTA", async () => {
    const params = await generateStaticParams();
    const packs = await listPacks();
    expect(params.map((p) => p.slug).sort()).toEqual(packs.map((p) => p.slug).sort());
    const pack = packs[0]!;
    const html = renderToStaticMarkup(await PackPage({ params: Promise.resolve({ slug: pack.slug }) }));
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(`href="/login?next=${encodeURIComponent(`/app/packs/${pack.slug}`)}"`);
    for (const p of pack.prompts) expect(html).toContain(p.title.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
  });

  it("docs page renders", () => {
    const html = renderToStaticMarkup(<DocsPage />);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain("docker compose up");
  });
});
