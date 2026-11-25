/** Server-renders the 404, root error and suspended pages: on brand, helpful, with a way forward. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/db/types";

const session = vi.hoisted(() => ({ user: null as Partial<UserRow> | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: vi.fn(async () => session.user) }));
// The sign-out button (signed-in suspended users) needs a router; there is no app router outside Next.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }),
}));

const { default: NotFound } = await import("@/app/not-found");
const { RootErrorView, supportMailto } = await import("@/components/layout/root-error-view");
const { default: SuspendedPage } = await import("@/app/suspended/page");
const { APP } = await import("@/config/app");

describe("404", () => {
  it("has one h1, home and app actions, and links to popular pages", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('id="main"');
    for (const href of ["/", "/app", "/packs", "/pricing", "/faq", "/docs"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('aria-label="Popular pages"');
  });
});

describe("root error view", () => {
  it("shows the reference, retry, home and a pre-filled support email", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    const html = renderToStaticMarkup(<RootErrorView error={error} retry={() => {}} />);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("abc123");
    expect(html).toContain("Try again");
    expect(html).toContain(`href="mailto:${APP.supportEmail}?subject=`);
    expect(html).not.toContain("boom");
  });

  it("builds the support email with the page and reference", () => {
    const url = new URL(supportMailto("abc123", "/pricing"));
    expect(url.protocol).toBe("mailto:");
    expect(url.searchParams.get("subject")).toContain("abc123");
    expect(url.searchParams.get("body")).toContain("Page: /pricing");
    expect(url.searchParams.get("body")).toContain("Reference: abc123");
    expect(new URL(supportMailto("", "")).searchParams.get("body")).not.toContain("Reference");
  });
});

describe("/suspended", () => {
  it("pre-fills the appeal email with the suspended account", async () => {
    session.user = { email: "ana@example.com", banned: true, banReason: "Spam", banExpires: null };
    const html = renderToStaticMarkup(await SuspendedPage());
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("Spam");
    const href = /href="(mailto:[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&");
    expect(new URL(href!).searchParams.get("subject")).toContain("ana@example.com");
  });

  it("sends a signed-in user who isn't suspended (any more) to the app", async () => {
    session.user = { email: "ana@example.com", banned: false };
    await expect(SuspendedPage()).rejects.toMatchObject({ digest: expect.stringContaining("/app") });
  });

  it("works signed out, with a contact button", async () => {
    session.user = null;
    const html = renderToStaticMarkup(await SuspendedPage());
    expect(html).toContain("Contact support");
    expect(html).not.toContain("Reason:");
  });
});
