/** Signup bonus through the real credit ledger (only the email provider is mocked). */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { creditLedger, user as userTable } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { getAuth, resetAuth } from "@/server/auth/auth";
import { magicLinkVerifyApiPath } from "@/server/auth/magic-link";
import { sendEmail } from "@/server/email";
import { createTestDb } from "../../helpers/db";

vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml_test" })) }));

const APP = "http://localhost:3000";
const saved = process.env.SIGNUP_BONUS_CREDITS;

async function signIn(email: string) {
  await getAuth().handler(
    new Request(`${APP}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: JSON.stringify({ email, callbackURL: "/app" }),
    }),
  );
  const call = vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === "magic_link").at(-1)!;
  const token = new URL((call[2] as { url: string }).url).searchParams.get("token")!;
  return getAuth().handler(
    new Request(`${APP}${magicLinkVerifyApiPath({ token, callbackURL: "/app", errorCallbackURL: "/login" })}`),
  );
}

beforeEach(async () => {
  await createTestDb();
  process.env.SIGNUP_BONUS_CREDITS = "30";
  resetEnvCache();
  resetAuth();
});

afterEach(() => {
  if (saved === undefined) delete process.env.SIGNUP_BONUS_CREDITS;
  else process.env.SIGNUP_BONUS_CREDITS = saved;
  resetEnvCache();
});

describe("signup bonus", () => {
  it("credits new users once, recorded in the ledger", async () => {
    await signIn("bonus@example.com");
    await signIn("bonus@example.com");
    const [u] = await db.select().from(userTable).where(eq(userTable.email, "bonus@example.com"));
    expect(u!.credits).toBe(30);
    const entries = await db.select().from(creditLedger).where(eq(creditLedger.userId, u!.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 30, reason: "signup_bonus" });
  });
});
