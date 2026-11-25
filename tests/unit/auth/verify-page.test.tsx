/** Server-renders /verify (no Next runtime) for each link state. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/db/types";

const state = vi.hoisted(() => ({
  user: null as Partial<UserRow> | null,
  pendingEmail: null as string | null,
}));

vi.mock("@/server/auth/session", () => ({ getCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/server/auth/magic-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/magic-link")>()),
  pendingMagicLinkEmail: vi.fn(async () => state.pendingEmail),
}));

const { default: VerifyPage } = await import("@/app/(auth)/verify/page");

async function render(params: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(await VerifyPage({ searchParams: Promise.resolve(params) }));
}

const decode = (html: string) => html.replace(/&amp;/g, "&");

beforeEach(() => {
  state.user = null;
  state.pendingEmail = null;
});

describe("/verify", () => {
  it("asks to confirm a valid link and shows the account it signs into", async () => {
    state.pendingEmail = "ana@example.com";
    const html = decode(await render({ token: "tok", callbackURL: "/app/packs/paris" }));
    expect(html).toContain("Confirm sign-in");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("/api/auth/magic-link/verify?token=tok&callbackURL=%2Fapp%2Fpacks%2Fparis");
    expect(html).not.toContain("Continuing switches");
  });

  it("warns before switching from another signed-in account", async () => {
    state.pendingEmail = "ana@example.com";
    state.user = { email: "bo@example.com", banned: false };
    const html = await render({ token: "tok" });
    expect(html).toContain("bo@example.com");
    expect(html).toContain("Continuing switches to the account above");
  });

  it("an expired or used link says so and keeps the destination for the new link", async () => {
    const html = decode(await render({ token: "used", callbackURL: "/app/packs/paris" }));
    expect(html).toContain("This link has expired or was already used");
    expect(html).toContain('href="/login?next=%2Fapp%2Fpacks%2Fparis"');
  });

  it("a used link while already signed in continues to the app instead of a dead end", async () => {
    state.user = { email: "ana@example.com", banned: false };
    const html = decode(await render({ token: "used", callbackURL: "/app/packs/paris" }));
    expect(html).toContain("You&#x27;re already signed in");
    expect(html).toContain('href="/app/packs/paris"');
    expect(html).not.toContain("expired");
  });

  it("an incomplete link offers a new one; unsafe destinations fall back to the app", async () => {
    const html = decode(await render({ callbackURL: "https://evil.example/" }));
    expect(html).toContain("This link is incomplete");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("evil.example");
  });
});
