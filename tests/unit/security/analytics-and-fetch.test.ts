/**
 * SEC-5: analytics never receive bearer tokens from URLs.
 * SEC-15: provider output downloads re-check every redirect hop (https + public host).
 */
import { describe, expect, it, vi } from "vitest";
import { isSensitivePath, sanitizePath, sanitizeUrl, scrubAnalyticsEvent } from "@/lib/analytics-url";
import { assertPublicHttpsUrl, fetchOutputBytes } from "@/providers/ai/shared/fetch-output";

describe("SEC-5: analytics URL scrubbing", () => {
  it.each([
    ["https://app.example/verify?token=SECRET&callbackURL=%2Fapp", "https://app.example/verify"],
    ["https://app.example/account/delete/confirm?token=SECRET", "https://app.example/account/delete/confirm"],
    ["https://app.example/s/SECRET", "https://app.example/s/:token"],
    ["https://app.example/invites/SECRET?x=1", "https://app.example/invites/:token"],
    ["https://app.example/teams/join/SECRET#frag", "https://app.example/teams/join/:token"],
    ["https://app.example/billing/mock-checkout?checkout=SIGNED&utm_source=x", "https://app.example/billing/mock-checkout"],
    ["https://app.example/dev/emails/eml_1", "https://app.example/dev/emails/:id"],
    ["https://app.example/app/gallery?q=private+prompt&sig=abc&exp=1&utm_source=news&ref=hn", "https://app.example/app/gallery?utm_source=news&ref=hn"],
    ["https://app.example/pricing#faq", "https://app.example/pricing"],
  ])("%s → %s", (raw, clean) => {
    expect(sanitizeUrl(raw)).toBe(clean);
    expect(sanitizeUrl(raw)).not.toContain("SECRET");
  });

  it("flags token-bearing routes and leaves others alone", () => {
    for (const p of ["/verify", "/s/abc", "/invites/abc", "/teams/join/abc", "/account/delete/confirm", "/billing/mock-checkout"]) {
      expect(isSensitivePath(p), p).toBe(true);
    }
    for (const p of ["/", "/pricing", "/app/gallery", "/settings", "/space"]) expect(isSensitivePath(p), p).toBe(false);
    expect(sanitizePath("/s/abc/extra")).toBe("/s/:token/extra");
    expect(sanitizeUrl("not a url")).toBeNull();
  });

  it("scrubs event and person URL properties in before_send", () => {
    const event = scrubAnalyticsEvent({
      event: "$pageview",
      properties: {
        $current_url: "https://app.example/verify?token=SECRET",
        $referrer: "https://app.example/s/SECRET",
        $pathname: "/invites/SECRET",
        $referrer_direct: "$direct",
        other: "kept",
      },
      $set_once: { $initial_current_url: "https://app.example/teams/join/SECRET?x=1", $initial_pathname: "/s/SECRET" },
    });
    expect(JSON.stringify(event)).not.toContain("SECRET");
    expect(event.properties).toMatchObject({
      $current_url: "https://app.example/verify",
      $referrer: "https://app.example/s/:token",
      $pathname: "/invites/:token",
      other: "kept",
    });
    expect(event.$set_once).toEqual({ $initial_current_url: "https://app.example/teams/join/:token", $initial_pathname: "/s/:token" });
  });
});

describe("SEC-15: fetchOutputBytes redirects", () => {
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
  const ok = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });

  it("follows https redirects to public hosts (manually, re-checking each hop)", async () => {
    const fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return String(url).includes("cdn") ? ok() : redirect("https://cdn.fal.media/out.png");
    });
    const out = await fetchOutputBytes("https://fal.media/files/x", { fetch: fetch as typeof globalThis.fetch });
    expect(out).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an http downgrade", "http://cdn.example/out.png"],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["loopback", "https://127.0.0.1:8080/x"],
    ["a private network", "https://10.0.0.5/x"],
    ["IPv6 loopback", "https://[::1]/x"],
    ["localhost", "https://localhost/x"],
  ])("refuses a redirect to %s", async (_label, location) => {
    const fetch = vi.fn(async () => redirect(location));
    await expect(fetchOutputBytes("https://fal.media/x", { fetch: fetch as typeof globalThis.fetch })).rejects.toThrow(
      /https|public host/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 redirects", async () => {
    let n = 0;
    const fetch = vi.fn(async () => redirect(`https://cdn${++n}.example/x`));
    await expect(fetchOutputBytes("https://fal.media/x", { fetch: fetch as typeof globalThis.fetch })).rejects.toThrow(/too many redirects/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("accepts public https hosts only", () => {
    expect(() => assertPublicHttpsUrl(new URL("https://replicate.delivery/a.png"))).not.toThrow();
    expect(() => assertPublicHttpsUrl(new URL("https://8.8.8.8/a.png"))).not.toThrow();
    expect(() => assertPublicHttpsUrl(new URL("https://192.168.1.1/a.png"))).toThrow();
    expect(() => assertPublicHttpsUrl(new URL("https://[fd00::1]/a.png"))).toThrow();
    expect(() => assertPublicHttpsUrl(new URL("https://metadata.google.internal/a"))).toThrow();
  });
});
