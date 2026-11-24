import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { enforceMagicLinkRateLimit, ipFromHeaders, toVerifyPageUrl } from "@/server/auth/magic-link";
import {
  admitSignIn,
  isAdminEmail,
  onUserCreated,
  prepareNewUser,
  signInBlockReason,
} from "@/server/auth/user-policy";
import { applyCredit } from "@/server/credits/ledger";
import { sendEmail } from "@/server/email";
import { rateLimit } from "@/server/rate-limit";
import { errors } from "@/server/http";
import { createTestDb, createTestUser } from "../../helpers/db";

vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml_test" })) }));
vi.mock("@/server/credits/ledger", () => ({ applyCredit: vi.fn(async () => ({ applied: true, balance: 10 })) }));
vi.mock("@/server/rate-limit", () => ({ rateLimit: vi.fn(async () => undefined) }));

const saved = { ...process.env };

beforeEach(async () => {
  await createTestDb();
  vi.mocked(sendEmail).mockClear();
  vi.mocked(applyCredit).mockClear();
  vi.mocked(rateLimit).mockReset();
});

afterEach(() => {
  for (const k of ["ADMIN_EMAILS", "SIGNUP_BONUS_CREDITS", "EMAIL_PROVIDER", "RESEND_API_KEY"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
});

describe("prepareNewUser", () => {
  const admins = ["boss@example.com"];

  it("lowercases the email and assigns role user", () => {
    expect(prepareNewUser({ email: " Jane@Example.COM ", name: "Jane" }, admins)).toEqual({
      email: "jane@example.com",
      name: "Jane",
      role: "user",
    });
  });

  it("assigns admin for ADMIN_EMAILS (case-insensitive)", () => {
    expect(prepareNewUser({ email: "BOSS@example.com" }, admins).role).toBe("admin");
    expect(isAdminEmail("boss@example.com", admins)).toBe(true);
    expect(isAdminEmail("boss@example.co", admins)).toBe(false);
  });

  it("ignores a role smuggled into the input", () => {
    expect(prepareNewUser({ email: "x@example.com", role: "admin" }, admins).role).toBe("user");
  });
});

describe("signInBlockReason", () => {
  const base = { banned: false, banExpires: null, deletedAt: null };
  it("allows normal users", () => expect(signInBlockReason(base)).toBeNull());
  it("blocks banned users", () => expect(signInBlockReason({ ...base, banned: true })).toBe("banned"));
  it("blocks until the ban expires", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(signInBlockReason({ ...base, banned: true, banExpires: new Date("2026-02-01") }, now)).toBe("banned");
    expect(signInBlockReason({ ...base, banned: true, banExpires: new Date("2025-12-01") }, now)).toBeNull();
  });
  it("blocks deleted users", () => expect(signInBlockReason({ ...base, deletedAt: new Date() })).toBe("deleted"));
});

describe("admitSignIn", () => {
  it("rejects banned users and lifts expired bans", async () => {
    const banned = await createTestUser({ banned: true, banReason: "abuse" });
    expect(await admitSignIn(banned.id)).toBe("banned");

    const expired = await createTestUser({ banned: true, banReason: "x", banExpires: new Date(Date.now() - 1000) });
    expect(await admitSignIn(expired.id)).toBeNull();
    const [row] = await db.select().from(userTable).where(eq(userTable.id, expired.id));
    expect(row).toMatchObject({ banned: false, banReason: null, banExpires: null });
  });
});

describe("onUserCreated", () => {
  it("grants SIGNUP_BONUS_CREDITS idempotently and sends the welcome email", async () => {
    process.env.SIGNUP_BONUS_CREDITS = "15";
    resetEnvCache();
    await onUserCreated({ id: "usr_1", email: "a@example.com", name: "Ann" });
    expect(applyCredit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr_1", delta: 15, reason: "signup_bonus", idempotencyKey: "signup:usr_1" }),
    );
    await vi.waitFor(() =>
      expect(sendEmail).toHaveBeenCalledWith("welcome", "a@example.com", { name: "Ann" }, { userId: "usr_1" }),
    );
  });

  it("never throws when the ledger or email fails", async () => {
    process.env.SIGNUP_BONUS_CREDITS = "5";
    resetEnvCache();
    vi.mocked(applyCredit).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("smtp down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(onUserCreated({ id: "usr_2", email: "b@example.com" })).resolves.toBeUndefined();
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    spy.mockRestore();
  });
});

describe("magic link helpers", () => {
  it("rewrites the API verify URL to the /verify page", () => {
    const url = toVerifyPageUrl(
      "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2Fapp&errorCallbackURL=%2Flogin",
      "https://shoot.example.com",
    );
    expect(url).toBe("https://shoot.example.com/verify?token=abc&callbackURL=%2Fapp&errorCallbackURL=%2Flogin");
  });

  it("reads the client IP from proxy headers", () => {
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(ipFromHeaders(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(ipFromHeaders(new Headers())).toBeNull();
  });

  it("rate limits by IP with a real email provider and maps the error to a 429 APIError", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_dummy";
    resetEnvCache();
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9" });
    await enforceMagicLinkRateLimit(headers);
    expect(rateLimit).toHaveBeenCalledWith("magicLinkPerHourPerIp", "ip:9.9.9.9");

    vi.mocked(rateLimit).mockRejectedValueOnce(errors.rateLimited(120));
    await expect(enforceMagicLinkRateLimit(headers)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("skips the IP limit in mock email mode and when the IP is unknown", async () => {
    await enforceMagicLinkRateLimit(new Headers({ "x-forwarded-for": "9.9.9.9" }));
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_dummy";
    resetEnvCache();
    await enforceMagicLinkRateLimit(new Headers());
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
