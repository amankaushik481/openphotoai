/**
 * Second security pass (docs/reviews/security-2.md), hardening findings.
 *   S2-6  the provider-output SSRF guard sees through IPv6 spellings of private IPv4 addresses
 */
import { describe, expect, it, vi } from "vitest";
import { assertPublicHttpsUrl, fetchOutputBytes } from "@/providers/ai/shared/fetch-output";

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
