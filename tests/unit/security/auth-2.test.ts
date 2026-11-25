/**
 * Second security pass (docs/reviews/security-2.md), auth findings. Real Better Auth through our
 * /api/auth route on PGlite; email + ledger mocked.
 *   S2-2  sign-out / session revocation takes effect immediately (no 5-minute cookie cache)
 *   S2-3  ADMIN_EMAILS never promotes an identity whose email isn't verified
 *   S2-4  names set at sign-up (magic link `name`, OAuth profile) are sanitized like PATCH /api/me
 *   S2-5  Better Auth's origin + callback URL checks run in tests exactly as in production
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { db } from "@/db";
import { session as sessionTable, user as userTable, verification } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { resetAuth } from "@/server/auth/auth";
import { magicLinkVerifyApiPath } from "@/server/auth/magic-link";
import { resolveRequestAuth } from "@/server/auth/session";
import { admitSignIn, prepareNewUser, sanitizeDisplayName } from "@/server/auth/user-policy";
import { sendEmail } from "@/server/email";
import { createTestDb, createTestUser } from "../../helpers/db";

vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml_test" })) }));
vi.mock("@/server/credits/ledger", () => ({ applyCredit: vi.fn(async () => ({ applied: true, balance: 0 })) }));

const APP = "http://localhost:3000";

beforeEach(async () => {
  await createTestDb();
  resetAuth();
  vi.mocked(sendEmail).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resetAuth();
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return authPost(
    new NextRequest(`${APP}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function lastLinkToken(): string {
  const call = vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === "magic_link").at(-1)!;
  return new URL((call[2] as { url: string }).url).searchParams.get("token")!;
}

function cookieOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

async function signIn(email: string, extra: Record<string, unknown> = {}): Promise<string> {
  expect((await post("/sign-in/magic-link", { email, callbackURL: "/app", ...extra })).status).toBe(200);
  const res = await authGet(
    new NextRequest(`${APP}${magicLinkVerifyApiPath({ token: lastLinkToken(), callbackURL: "/app", errorCallbackURL: "/login" })}`),
  );
  expect(res.headers.get("location")).toBe(`${APP}/app`);
  return cookieOf(res);
}

const currentUser = async (cookie: string) =>
  (await resolveRequestAuth(new NextRequest(`${APP}/api/me`, { headers: { cookie } }), "user")).user;

describe("S2-2: revoking a session takes effect on the next request", () => {
  it("a copied cookie stops working right after sign-out", async () => {
    const cookie = await signIn("alice@example.com");
    expect((await currentUser(cookie))?.email).toBe("alice@example.com");
    expect((await post("/sign-out", {}, { cookie })).status).toBe(200);
    // An attacker who copied both cookies before the sign-out gets nothing.
    expect(await currentUser(cookie)).toBeNull();
  });

  it("revoke-sessions (sign out everywhere) ends every other device at once", async () => {
    const laptop = await signIn("bob@example.com");
    const phone = await signIn("bob@example.com");
    expect((await currentUser(phone))?.email).toBe("bob@example.com");
    expect((await post("/revoke-sessions", {}, { cookie: laptop })).status).toBe(200);
    expect(await currentUser(phone)).toBeNull();
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "bob@example.com"));
    expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, u!.id))).toHaveLength(0);
  });
});

describe("S2-3: ADMIN_EMAILS needs a verified email", () => {
  const admins = ["boss@example.com"];

  it("creates an unverified identity (e.g. an OAuth profile with email_verified=false) as a plain user", () => {
    expect(prepareNewUser({ email: "boss@example.com", emailVerified: false }, admins).role).toBe("user");
    expect(prepareNewUser({ email: "boss@example.com" }, admins).role).toBe("user");
    expect(prepareNewUser({ email: "Boss@example.com", emailVerified: true }, admins).role).toBe("admin");
  });

  it("doesn't promote an existing unverified account on sign-in", async () => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    resetEnvCache();
    const unverified = await createTestUser({ email: "boss@example.com", emailVerified: false });
    await admitSignIn(unverified.id);
    const [row] = await db.select().from(userTable).where(eq(userTable.id, unverified.id));
    expect(row!.role).toBe("user");

    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, unverified.id));
    await admitSignIn(unverified.id);
    const [promoted] = await db.select().from(userTable).where(eq(userTable.id, unverified.id));
    expect(promoted!.role).toBe("admin");
  });
});

describe("S2-4: display names from sign-up are sanitized", () => {
  it("caps the magic-link `name` (it used to store 20 000 characters) and strips control/bidi characters", async () => {
    const cookie = await signIn("mallory@example.com", { name: `  Ann‮\u0000\n${"A".repeat(20_000)} https://evil.example` });
    const [row] = await db.select().from(userTable).where(eq(userTable.email, "mallory@example.com"));
    expect(row!.name.length).toBeLessThanOrEqual(80);
    expect(row!.name).toMatch(/^Ann A+$/);
    expect(cookie).toBeTruthy();
  });

  it("sanitizeDisplayName", () => {
    expect(sanitizeDisplayName("  Jane   Doe ")).toBe("Jane Doe");
    expect(sanitizeDisplayName("Eve‮gnp.exe")).toBe("Evegnp.exe");
    expect(sanitizeDisplayName("a\tb\r\nc")).toBe("a b c");
    expect(sanitizeDisplayName("x".repeat(200))).toHaveLength(80);
    expect(sanitizeDisplayName("")).toBe("");
  });
});

describe("verified: magic links, session fixation, OAuth state, disabled account endpoints", () => {
  it("an expired link doesn't sign in", async () => {
    expect((await post("/sign-in/magic-link", { email: "late@example.com", callbackURL: "/app" })).status).toBe(200);
    const token = lastLinkToken();
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await authGet(new NextRequest(`${APP}${magicLinkVerifyApiPath({ token, callbackURL: "/app", errorCallbackURL: "/login" })}`));
    expect(res.headers.get("location")).toBe(`${APP}/login?error=INVALID_TOKEN`);
    expect(cookieOf(res)).toBe("");
  });

  it("signing in never adopts a session token planted before sign-in (no fixation)", async () => {
    expect((await post("/sign-in/magic-link", { email: "fix@example.com", callbackURL: "/app" })).status).toBe(200);
    const planted = "better-auth.session_token=attacker-chosen-token.c2lnbmF0dXJl";
    const res = await authGet(
      new NextRequest(`${APP}${magicLinkVerifyApiPath({ token: lastLinkToken(), callbackURL: "/app", errorCallbackURL: "/login" })}`, {
        headers: { cookie: planted },
      }),
    );
    const cookie = cookieOf(res);
    expect(cookie).toContain("better-auth.session_token=");
    expect(cookie).not.toContain("attacker-chosen-token");
    expect(await currentUser(planted)).toBeNull();
    expect((await currentUser(cookie))?.email).toBe("fix@example.com");
  });

  it("an OAuth callback with a forged state is refused before any token exchange", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
    resetEnvCache();
    resetAuth();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
    const res = await authGet(new NextRequest(`${APP}/api/auth/callback/google?code=stolen-code&state=forged-state`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^http:\/\/localhost:3000\/login\?error=/);
    expect(cookieOf(res)).not.toContain("session_token");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("email change and self-service deletion through Better Auth are off (account deletion is email-confirmed)", async () => {
    const cookie = await signIn("dave@example.com");
    const change = await post("/change-email", { newEmail: "mallory@example.com", callbackURL: "/app" }, { cookie });
    expect(change.status).toBe(400);
    expect((await post("/delete-user", {}, { cookie })).status).toBe(404);
    const [row] = await db.select().from(userTable).where(eq(userTable.email, "dave@example.com"));
    expect(row).toBeDefined();
  });
});

describe("S2-5: production origin checks also run in tests", () => {
  it("refuses foreign callback URLs when a link is requested", async () => {
    for (const callbackURL of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      const res = await post("/sign-in/magic-link", { email: "a@example.com", callbackURL });
      expect(res.status, callbackURL).toBe(403);
    }
    for (const field of ["errorCallbackURL", "newUserCallbackURL"]) {
      const res = await post("/sign-in/magic-link", { email: "a@example.com", callbackURL: "/app", [field]: "https://evil.example" });
      expect(res.status, field).toBe(403);
    }
    expect(vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === "magic_link")).toHaveLength(0);
  });

  it("never redirects off-site from the verify endpoint (no open redirect)", async () => {
    expect((await post("/sign-in/magic-link", { email: "b@example.com", callbackURL: "/app" })).status).toBe(200);
    const token = lastLinkToken();
    for (const qs of [
      `token=${token}&callbackURL=${encodeURIComponent("https://evil.example")}`,
      `token=nope&callbackURL=%2Fapp&errorCallbackURL=${encodeURIComponent("https://evil.example/err")}`,
    ]) {
      const res = await authGet(new NextRequest(`${APP}/api/auth/magic-link/verify?${qs}`));
      expect(res.headers.get("location") ?? "", qs).not.toContain("evil.example");
      expect(res.status, qs).toBe(403);
    }
  });

  it("refuses a cross-origin request that carries the session cookie", async () => {
    const cookie = await signIn("c@example.com");
    const res = await post("/sign-out", {}, { cookie, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await currentUser(cookie))?.email).toBe("c@example.com");
  });
});
