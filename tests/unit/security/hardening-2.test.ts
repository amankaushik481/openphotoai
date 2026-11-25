/**
 * Second security pass (docs/reviews/security-2.md), hardening findings.
 *   S2-6  the provider-output SSRF guard sees through IPv6 spellings of private IPv4 addresses
 *   S2-9  page headers: form-action + COOP; no 10 MB server-action body limit (there are no actions)
 *   S2-10 mock AI webhook signatures use a purpose-bound key, not BETTER_AUTH_SECRET directly
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";
import { assertPublicHttpsUrl, fetchOutputBytes } from "@/providers/ai/shared/fetch-output";
import { createMockAIProvider, MOCK_WEBHOOK_HEADER, signMockWebhook } from "@/providers/mock/ai";
import nextConfig from "../../../next.config";

describe("S2-10: mock AI webhooks are signed with a purpose-bound key", () => {
  it("never with BETTER_AUTH_SECRET itself (which also signs session cookies)", async () => {
    const body = JSON.stringify({ requestId: "mock-req", status: "completed" });
    const raw = createHmac("sha256", getEnv().authSecret).update(body).digest("hex");
    expect(signMockWebhook(body)).not.toBe(raw);
    const ai = createMockAIProvider();
    const req = (sig: string) => ({ headers: new Headers({ [MOCK_WEBHOOK_HEADER]: sig }), rawBody: body, url: "http://x" });
    await expect(ai.parseWebhook(req(raw))).rejects.toThrow(/signature/);
    await expect(ai.parseWebhook(req(signMockWebhook(body)))).resolves.toMatchObject({ requestId: "mock-req" });
  });
});

describe("S2-9: security headers", () => {
  async function headersFor(path: string) {
    const rules = (await nextConfig.headers?.()) ?? [];
    const out = new Map<string, string>();
    for (const rule of rules) {
      const pattern = new RegExp(`^${rule.source.replace("/:path*", "(/.*)?").replace("/:path((?!api/).*)", "/(?!api/).*")}$`);
      if (pattern.test(path)) for (const h of rule.headers) out.set(h.key, h.value);
    }
    return out;
  }

  it("pages forbid off-site form posts and keep no opener relationship", async () => {
    const page = await headersFor("/app/gallery");
    expect(page.get("Content-Security-Policy")).toContain("form-action 'self'");
    expect(page.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(page.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(page.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("API routes keep their own CSP (e.g. /api/files' sandbox)", async () => {
    const api = await headersFor("/api/files/users/u/media/m.jpg");
    expect(api.has("Content-Security-Policy")).toBe(false);
    expect(api.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("doesn't raise the server-action body limit (the app has no server actions)", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBeUndefined();
  });
});

describe("S2-6: SSRF guard on provider output URLs", () => {
  it.each([
    ["IPv4-mapped loopback (WHATWG prints it as hex)", "https://[::ffff:127.0.0.1]/x"],
    ["IPv4-mapped metadata", "https://[::ffff:a9fe:a9fe]/latest/meta-data"],
    ["IPv4-compatible loopback", "https://[::7f00:1]/x"],
    ["NAT64 loopback", "https://[64:ff9b::7f00:1]/x"],
    ["NAT64 private", "https://[64:ff9b::a00:5]/x"],
    ["6to4 private", "https://[2002:a00:5::1]/x"],
    ["unspecified", "https://[::]/x"],
    ["site-local", "https://[fec0::1]/x"],
    ["documentation", "https://[2001:db8::1]/x"],
    ["IETF protocol assignments", "https://192.0.0.8/x"],
    ["localhost with a trailing dot", "https://localhost./x"],
    ["a .localhost name with a trailing dot", "https://api.localhost./x"],
    ["an .internal name with a trailing dot", "https://metadata.google.internal./x"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertPublicHttpsUrl(new URL(url))).toThrow(/public host/);
  });

  it.each([
    ["a provider CDN", "https://v3.fal.media/files/out.png"],
    ["a public IPv4", "https://8.8.8.8/a.png"],
    ["a public IPv6", "https://[2606:4700:4700::1111]/a.png"],
    ["an IPv4-mapped public address", "https://[::ffff:8.8.8.8]/a.png"],
  ])("accepts %s", (_label, url) => {
    expect(() => assertPublicHttpsUrl(new URL(url))).not.toThrow();
  });

  it("refuses a redirect to an IPv4-mapped loopback address", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://[::ffff:7f00:1]:8080/admin" } }));
    await expect(fetchOutputBytes("https://fal.media/x", { fetch: fetch as typeof globalThis.fetch })).rejects.toThrow(/public host/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
