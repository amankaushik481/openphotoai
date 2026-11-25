/**
 * S2-7 (docs/reviews/security-2.md): without a trusted proxy (TRUSTED_PROXY_HOPS=0, the Docker
 * default) every visitor's IP is "unknown", so a per-IP limit is one bucket for the whole deployment.
 * One client used to be able to block every user's account-deletion confirmation (10/h), every
 * signed-in user's abuse report (20/h) and the demo button (5/h). Limits now fall back to a subject
 * that is still per user / per request target; anonymous reports stay fail-closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as confirmDeletion } from "@/app/api/account/delete/confirm/route";
import { POST as reportPost } from "@/app/api/reports/route";
import { RATE_LIMITS } from "@/config/rate-limits";
import { resetEnvCache } from "@/lib/env";
import { checkRateLimit } from "@/server/rate-limit";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml" })), sendEmailSafe: vi.fn(async () => null) }));

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

const fill = async (name: keyof typeof RATE_LIMITS, subject: string) => {
  await checkRateLimit(name, subject, RATE_LIMITS[name].limit);
};

describe("S2-7: per-IP limits without a known client IP", () => {
  it("garbage deletion tokens from one client don't block anyone else's confirmation", async () => {
    await fill("accountDeleteConfirmPerHourPerIp", "ip:unknown");
    const res = await callRoute(confirmDeletion, { url: "/api/account/delete/confirm", body: { token: "someone-elses-real-token" } });
    expect(res.status).not.toBe(429);
  });

  it("still limits hammering one token", async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= RATE_LIMITS.accountDeleteConfirmPerHourPerIp.limit; i++) {
      statuses.push((await callRoute(confirmDeletion, { url: "/api/account/delete/confirm", body: { token: "same-token" } })).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1)).not.toContain(429);
  });

  it("keeps the per-IP limit when the IP is known", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    resetEnvCache();
    await fill("accountDeleteConfirmPerHourPerIp", "ip:203.0.113.7");
    const res = await callRoute(confirmDeletion, {
      url: "/api/account/delete/confirm",
      body: { token: "fresh" },
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.status).toBe(429);
  });

  it("an anonymous flood doesn't silence signed-in reporters", async () => {
    await fill("reportsPerHourPerIp", "ip:unknown");
    const anonymous = await callRoute(reportPost, { url: "/api/reports", body: { shareToken: "x".repeat(32), reason: "other" } });
    expect(anonymous.status).toBe(429); // anonymous reports without an IP stay fail-closed

    sessionMock.setUser(await createTestUser());
    const signedIn = await callRoute(reportPost, { url: "/api/reports", body: { shareToken: "x".repeat(32), reason: "non_consensual" } });
    expect(signedIn.status).toBe(200);
  });

  it("limits signed-in reporters per account", async () => {
    const reporter = await createTestUser();
    sessionMock.setUser(reporter);
    await fill("reportsPerHourPerIp", `user:${reporter.id}`);
    const res = await callRoute(reportPost, { url: "/api/reports", body: { shareToken: "x".repeat(32), reason: "other" } });
    expect(res.status).toBe(429);
  });
});
