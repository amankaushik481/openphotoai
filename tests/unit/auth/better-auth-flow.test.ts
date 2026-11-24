/**
 * End-to-end Better Auth flow against PGlite: magic link request → /verify URL →
 * verify endpoint → session cookie → resolveRequestAuth. Email + ledger are mocked.
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { session as sessionTable, user as userTable } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { getAuth, resetAuth } from "@/server/auth/auth";
import { magicLinkVerifyApiPath } from "@/server/auth/magic-link";
import { resolveRequestAuth } from "@/server/auth/session";
import { applyCredit } from "@/server/credits/ledger";
import { sendEmail } from "@/server/email";
import { createTestDb, createTestUser } from "../../helpers/db";

vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml_test" })) }));
vi.mock("@/server/credits/ledger", () => ({ applyCredit: vi.fn(async () => ({ applied: true, balance: 0 })) }));

const APP = "http://localhost:3000";
const ENV_KEYS = ["ADMIN_EMAILS", "SIGNUP_BONUS_CREDITS"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  Object.assign(process.env, values);
  resetEnvCache();
}

async function requestMagicLink(email: string): Promise<Response> {
  return getAuth().handler(
    new Request(`${APP}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: JSON.stringify({ email, callbackURL: "/app/models", errorCallbackURL: "/login" }),
    }),
  );
}

function lastMagicLinkUrl(): URL {
  const call = vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === "magic_link").at(-1);
  if (!call) throw new Error("no magic_link email sent");
  return new URL((call[2] as { url: string }).url);
}

/** Follow the emailed /verify link the way the verify page does (click → API). */
async function clickMagicLink(): Promise<Response> {
  const page = lastMagicLinkUrl();
  const path = magicLinkVerifyApiPath({
    token: page.searchParams.get("token")!,
    callbackURL: page.searchParams.get("callbackURL") ?? "/app",
    errorCallbackURL: "/login",
  });
  return getAuth().handler(new Request(`${APP}${path}`, { redirect: "manual" }));
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

async function signInViaMagicLink(email: string): Promise<Response> {
  const sent = await requestMagicLink(email);
  expect(sent.status).toBe(200);
  return clickMagicLink();
}

beforeEach(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  await createTestDb();
  resetAuth();
  vi.mocked(sendEmail).mockClear();
  vi.mocked(applyCredit).mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetEnvCache();
});

describe("magic link sign-in", () => {
  it("emails a link to the scanner-safe /verify page", async () => {
    await requestMagicLink("someone@example.com");
    const url = lastMagicLinkUrl();
    expect(url.origin + url.pathname).toBe(`${APP}/verify`);
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(url.searchParams.get("callbackURL")).toBe("/app/models");
  });

  it("creates a new user (lowercased email), sets a session and resolves the request user", async () => {
    const res = await signInViaMagicLink("New.Person@Example.com");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/app/models`);

    const [created] = await db.select().from(userTable).where(eq(userTable.email, "new.person@example.com"));
    expect(created).toBeDefined();
    expect(created!.role).toBe("user");
    expect(created!.id.startsWith("usr_")).toBe(true);
    expect(created!.credits).toBe(0);
    expect(created!.plan).toBe("free");

    const cookie = cookieHeader(res);
    const auth = await resolveRequestAuth(new NextRequest(`${APP}/api/me`, { headers: { cookie } }), "user");
    expect(auth.user?.id).toBe(created!.id);
    expect(auth.apiKey).toBeNull();
  });

  it("sends the welcome email and no bonus when SIGNUP_BONUS_CREDITS is 0", async () => {
    await signInViaMagicLink("fresh@example.com");
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledWith("welcome", "fresh@example.com", { name: "" }, expect.anything()));
    expect(applyCredit).not.toHaveBeenCalled();
  });

  it("grants the signup bonus once with an idempotency key", async () => {
    setEnv({ SIGNUP_BONUS_CREDITS: "25" });
    await signInViaMagicLink("bonus@example.com");
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "bonus@example.com"));
    expect(applyCredit).toHaveBeenCalledTimes(1);
    expect(applyCredit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: u!.id, delta: 25, reason: "signup_bonus", idempotencyKey: `signup:${u!.id}` }),
    );
    // Second sign-in: existing user, no new grant.
    await signInViaMagicLink("bonus@example.com");
    expect(applyCredit).toHaveBeenCalledTimes(1);
  });

  it("makes ADMIN_EMAILS users admins", async () => {
    setEnv({ ADMIN_EMAILS: "boss@example.com, other@example.com" });
    await signInViaMagicLink("Boss@Example.com");
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "boss@example.com"));
    expect(u!.role).toBe("admin");
  });

  it("promotes an existing user listed in ADMIN_EMAILS on their next sign-in", async () => {
    const existing = await createTestUser({ email: "later@example.com" });
    setEnv({ ADMIN_EMAILS: "later@example.com" });
    await signInViaMagicLink("later@example.com");
    const [u] = await db.select().from(userTable).where(eq(userTable.id, existing.id));
    expect(u!.role).toBe("admin");
  });

  it("refuses banned users: redirect to /suspended and no session", async () => {
    const banned = await createTestUser({ email: "banned@example.com", banned: true, banReason: "spam" });
    const res = await signInViaMagicLink("banned@example.com");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/suspended`);
    const sessions = await db.select().from(sessionTable).where(eq(sessionTable.userId, banned.id));
    expect(sessions).toHaveLength(0);
  });

  it("refuses deleted users", async () => {
    await createTestUser({ email: "gone@example.com", deletedAt: new Date() });
    const res = await signInViaMagicLink("gone@example.com");
    expect(res.headers.get("location")).toBe(`${APP}/login?error=ACCOUNT_DELETED`);
  });

  it("lets users with an expired ban back in and clears the ban", async () => {
    const u = await createTestUser({
      email: "served@example.com",
      banned: true,
      banExpires: new Date(Date.now() - 60_000),
    });
    const res = await signInViaMagicLink("served@example.com");
    expect(res.headers.get("location")).toBe(`${APP}/app/models`);
    const [row] = await db.select().from(userTable).where(eq(userTable.id, u.id));
    expect(row!.banned).toBe(false);
  });

  it("rejects a reused token", async () => {
    await requestMagicLink("twice@example.com");
    await clickMagicLink();
    const again = await clickMagicLink();
    expect(again.headers.get("location")).toContain("/login?error=INVALID_TOKEN");
  });

  it("does not let clients set app fields through update-user", async () => {
    const res = await signInViaMagicLink("sneaky@example.com");
    const cookie = cookieHeader(res);
    const attempt = await getAuth().handler(
      new Request(`${APP}/api/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP, cookie },
        body: JSON.stringify({ role: "admin", credits: 9999 }),
      }),
    );
    expect(attempt.status).toBeGreaterThanOrEqual(400);
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "sneaky@example.com"));
    expect(u!.role).toBe("user");
    expect(u!.credits).toBe(0);
  });
});
