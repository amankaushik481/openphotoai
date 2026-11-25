import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/packs/linkedin-headshots" }));

const { MarketingNavLinks, isCurrentPath } = await import("@/components/layout/marketing-nav-links");
const { MarketingHeader } = await import("@/components/layout/marketing-header");

describe("marketing nav current page", () => {
  it("matches a section and the pages below it, nothing else", () => {
    expect(isCurrentPath("/pricing", "/pricing")).toBe(true);
    expect(isCurrentPath("/packs/paris", "/packs")).toBe(true);
    expect(isCurrentPath("/packsx", "/packs")).toBe(false);
    expect(isCurrentPath("/docs", "/docs/api")).toBe(false);
    expect(isCurrentPath("/", "/packs")).toBe(false);
    expect(isCurrentPath(null, "/packs")).toBe(false);
    expect(isCurrentPath("/x", "https://github.com/x")).toBe(false);
  });

  it("marks the current section with aria-current=page", () => {
    const html = renderToStaticMarkup(
      <MarketingNavLinks
        className="link"
        links={[
          { href: "/packs", label: "Packs" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />,
    );
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/packs"/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  it("header: one labelled nav, menu button with dialog semantics, external link announced", () => {
    const html = renderToStaticMarkup(<MarketingHeader />);
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html).toMatch(/<nav aria-label="[^"]+"/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("(opens in a new tab)");
    expect(html).toContain('aria-current="page"');
  });
});
