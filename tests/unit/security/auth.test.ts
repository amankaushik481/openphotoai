/**
 * Better Auth hardening, through our /api/auth route (real Better Auth + PGlite, email mocked):
 *   SEC-7  /api/auth/update-user is disabled (ported from update-user.probe.ts)
 *   SEC-8  no `trustedProviders` on account linking; team invites need a verified email
 *   SEC-11 /verify can show which account a pending magic link signs into
 *   SEC-4  Better Auth sees our trusted-proxy client IP; a client-sent copy of the header is dropped
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { db } from "@/db";
import { session as sessionTable, user as userTable } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { getAuth, resetAuth } from "@/server/auth/auth";
import { magicLinkVerifyApiPath, pendingMagicLinkEmail } from "@/server/auth/magic-link";
import { sendEmail } from "@/server/email";
import { CLIENT_IP_HEADER } from "@/server/http";
import { acceptInvite, createTeam, inviteMember } from "@/server/teams";
import { createTestDb, createTestUser } from "../../helpers/db";
import { inviteTokenFor, resetTeamMocks, studioUser } from "../teams/fixtures";

vi.mock("@/server/email", async () => {
  const fixtures = await import("../teams/fixtures");
  return { ...fixtures.emailModuleMock, sendEmail: vi.fn(fixtures.emailModuleMock.sendEmail) };
});
vi.mock("@/server/credits/ledger", () => ({ applyCredit: vi.fn(async () => ({ applied: true, balance: 0 })) }));

const APP = "http://localhost:3000";

beforeEach(async () => {
  await createTestDb();
  resetAuth();
  resetTeamMocks();
  vi.mocked(sendEmail).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resetAuth();
});

async function requestLink(email: string, headers: Record<string, string> = {}) {
  const res = await authPost(
    new NextRequest(`${APP}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP, ...headers },
      body: JSON.stringify({ email, callbackURL: "/app" }),
    }),
  );
  expect(res.status).toBe(200);
  const call = vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === "magic_link").at(-1)!;
  return new URL((call[2] as { url: string }).url).searchParams.get("token")!;
}

async function signIn(email: string, headers: Record<string, string> = {}) {
  const token = await requestLink(email);
  const res = await authGet(
    new NextRequest(`${APP}${magicLinkVerifyApiPath({ token, callbackURL: "/app", errorCallbackURL: "/login" })}`, { headers }),
  );
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
  return { token, cookie };
}

describe("SEC-7: update-user is disabled", () => {
  it("refuses image/name changes that bypass PATCH /api/me validation", async () => {
    const { cookie } = await signIn("mallory@example.com");
    const res = await authPost(
      new NextRequest(`${APP}/api/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP, cookie },
        body: JSON.stringify({ image: "https://attacker.example/track.gif", name: "A".repeat(20000) }),
      }),
    );
    expect(res.status).toBe(404);
    const [row] = await db.select().from(userTable).where(eq(userTable.email, "mallory@example.com"));
    expect(row!.image).toBeNull();
    expect(row!.name.length).toBeLessThan(100);
  });
});

describe("SEC-8: account linking + team invites", () => {
  it("doesn't trust Google blindly for account linking (email_verified is checked)", () => {
    expect(getAuth().options.account?.accountLinking?.trustedProviders).toBeUndefined();
  });

  it("refuses a team invite for an unverified email address", async () => {
    const owner = await studioUser();
    const member = await createTestUser({ email: "unverified@example.com", emailVerified: false });
    const team = await createTeam(owner, "Acme");
    await inviteMember(owner, team.id, member.email);
    await expect(acceptInvite(member, inviteTokenFor(member.email))).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("SEC-11: /verify shows the account a link signs into", () => {
  it("resolves a pending token to its email without consuming it", async () => {
    const token = await requestLink("Alice@Example.com");
    expect((await pendingMagicLinkEmail(token))?.toLowerCase()).toBe("alice@example.com");
    expect(await pendingMagicLinkEmail(token)).not.toBeNull(); // still pending: reading doesn't consume it
    expect(await pendingMagicLinkEmail("not-a-real-token")).toBeNull();

    await authGet(new NextRequest(`${APP}${magicLinkVerifyApiPath({ token, callbackURL: "/app", errorCallbackURL: "/login" })}`));
    expect(await pendingMagicLinkEmail(token)).toBeNull(); // used
  });
});

describe("SEC-4: Better Auth uses the trusted-proxy client IP", () => {
  async function sessionIp(headers: Record<string, string>) {
    await signIn("ip@example.com", headers);
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "ip@example.com"));
    const [s] = await db.select().from(sessionTable).where(eq(sessionTable.userId, u!.id));
    return s!.ipAddress;
  }

  it("records the proxy-resolved IP and drops a client-sent copy of the internal header", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    resetEnvCache();
    resetAuth();
    expect(await sessionIp({ "x-forwarded-for": "6.6.6.6, 203.0.113.7", [CLIENT_IP_HEADER]: "6.6.6.6" })).toBe("203.0.113.7");
  });

  it("never trusts the client's header when no proxy is trusted", async () => {
    const ip = await sessionIp({ "x-forwarded-for": "6.6.6.6", [CLIENT_IP_HEADER]: "6.6.6.6" });
    expect(ip).not.toBe("6.6.6.6");
  });
});
