/**
 * SEC-4: the client IP comes from the trusted proxy chain (TRUSTED_PROXY_HOPS), so a client can't
 * rotate X-Forwarded-For to dodge per-IP limits. SEC-17: the anonymous report form no longer mails
 * arbitrary addresses. Ported from the review probe xff.probe.ts.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reportPost } from "@/app/api/reports/route";
import { resetEnvCache } from "@/lib/env";
import { sendEmailSafe } from "@/server/email";
import { clientIp, clientIpFromHeaders, forwardedChain } from "@/server/http";
import { createTestDb, createTestMedia, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "eml" })),
  sendEmailSafe: vi.fn(async () => ({ id: "eml", status: "sent" })),
}));
vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);

const h = (init: Record<string, string>) => new Headers(init);

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("clientIpFromHeaders", () => {
  it("ignores forwarded headers without a trusted proxy (hops = 0, the default outside Vercel)", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), 0)).toBeNull();
    expect(clientIpFromHeaders(h({ "x-real-ip": "203.0.113.7" }), 0)).toBeNull();
    expect(clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7" } }))).toBe("unknown");
  });

  it("takes the Nth entry from the right, so client-added entries on the left are ignored", () => {
    const chain = h({ "x-forwarded-for": "10.9.1.1, 198.51.100.2, 203.0.113.7" });
    expect(clientIpFromHeaders(chain, 1)).toBe("203.0.113.7");
    expect(clientIpFromHeaders(chain, 2)).toBe("198.51.100.2");
    // Fewer entries than hops: the leftmost is the best available.
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), 2)).toBe("203.0.113.7");
  });

  it("uses X-Real-IP only behind a trusted proxy that sends no X-Forwarded-For", () => {
    expect(clientIpFromHeaders(h({ "x-real-ip": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "1.1.1.1" }), 1)).toBe("203.0.113.7");
  });

  it("normalizes ports, brackets and IPv4-mapped IPv6, and rejects garbage", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.7:51234" }), 1)).toBe("203.0.113.7");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "[2001:DB8::1]:443" }), 1)).toBe("2001:db8::1");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "::ffff:198.51.100.4" }), 1)).toBe("198.51.100.4");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "evil, <script>" }), 1)).toBeNull();
  });

  it("follows TRUSTED_PROXY_HOPS / VERCEL from env and keeps the raw chain for evidence", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" } });
    vi.stubEnv("VERCEL", "1");
    resetEnvCache();
    expect(clientIp(req)).toBe("203.0.113.7");
    expect(forwardedChain(req)).toEqual({ xForwardedFor: "6.6.6.6, 203.0.113.7", xRealIp: null });
  });
});

describe("per-IP limits can't be dodged with a rotating X-Forwarded-For (reports: 20/h/IP)", () => {
  beforeEach(async () => {
    await createTestDb();
    sessionMock.reset();
    vi.mocked(sendEmailSafe).mockClear();
  });

  async function report(i: number, body: Record<string, unknown>) {
    return reportPost(
      new NextRequest("http://localhost:3000/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${i}.1, 203.0.113.7` },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    );
  }

  it("rate-limits by the proxy-appended address behind one proxy", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    resetEnvCache();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await report(i, { mediaId: "med_nope", reason: "other" })).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it("never emails the free-text address of an anonymous reporter (SEC-17); signed-in reporters get an ack at their account email", async () => {
    await report(0, { mediaId: "med_nope", reason: "other", email: "victim@example.org" });
    const recipients = vi.mocked(sendEmailSafe).mock.calls.map((c) => c[1]);
    expect(recipients).not.toContain("victim@example.org");
    expect(recipients).toEqual(["takedown@example.com"]);

    const reporter = await createTestUser({ email: "reporter@example.com" });
    const target = await createTestMedia((await createTestUser()).id);
    sessionMock.setUser(reporter);
    vi.mocked(sendEmailSafe).mockClear();
    await report(1, { mediaId: target.id, reason: "other", email: "someone-else@example.org" });
    expect(vi.mocked(sendEmailSafe).mock.calls.map((c) => c[1]).sort()).toEqual(["reporter@example.com", "takedown@example.com"]);
  });
});
