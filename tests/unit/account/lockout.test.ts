/**
 * "Never leave a half-deleted user able to log in": once deletion has started (even if a later step
 * fails), the session cookie, a fresh magic-link sign-in and API keys all stop working.
 * Uses the real Better Auth instance + request auth against PGlite.
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { createApiKey } from "@/server/auth/api-keys";
import { getAuth, resetAuth } from "@/server/auth/auth";
import { magicLinkVerifyApiPath } from "@/server/auth/magic-link";
import { authenticateApiKey, resolveRequestAuth } from "@/server/auth/session";
import { sendEmail } from "@/server/email";
import { createTestDb } from "../../helpers/db";
import { createPaymentProviderMock, useTempStorage } from "./fixtures";

const state = vi.hoisted(() => ({ payment: null as unknown }));
vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock(state));
vi.mock("@/server/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "eml_test", status: "mocked" })),
  sendEmailSafe: vi.fn(async () => ({ id: "eml_test", status: "mocked" })),
}));
vi.mock("@/server/credits/ledger", () => ({ applyCredit: vi.fn(async () => ({ applied: true, balance: 0 })) }));
vi.mock("@/server/models/service", () => ({
  deleteModelCompletely: vi.fn(async () => {
    throw new Error("provider unavailable");
  }),
}));
vi.mock("@/server/jobs/engine", () => ({ cancelJob: vi.fn() }));

const { confirmAccountDeletion, requestAccountDeletion } = await import("@/server/account");
const { createTestModel } = await import("../../helpers/factories");

const APP = "http://localhost:3000";
const EMAIL = "locked@example.com";
let cleanup: () => Promise<void>;

beforeEach(async () => {
  await createTestDb();
  resetAuth();
  ({ cleanup } = await useTempStorage());
  state.payment = createPaymentProviderMock();
  vi.mocked(sendEmail).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

function lastEmailUrl(template: string): URL {
  const call = vi.mocked(sendEmail).mock.calls.filter((c) => c[0] === template).at(-1);
  if (!call) throw new Error(`no ${template} email sent`);
  return new URL((call[2] as { url: string }).url);
}

async function signIn(email: string): Promise<Response> {
  const sent = await getAuth().handler(
    new Request(`${APP}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: JSON.stringify({ email, callbackURL: "/app", errorCallbackURL: "/login" }),
    }),
  );
  expect(sent.status).toBe(200);
  const page = lastEmailUrl("magic_link");
  const path = magicLinkVerifyApiPath({
    token: page.searchParams.get("token")!,
    callbackURL: "/app",
    errorCallbackURL: "/login",
  });
  return getAuth().handler(new Request(`${APP}${path}`, { redirect: "manual" }));
}

function cookieOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

describe("account deletion locks the account before deleting anything", () => {
  it("rejects the session cookie, new magic-link sign-ins and API keys once deletion starts", async () => {
    const cookie = cookieOf(await signIn(EMAIL));
    const [u] = await db.select().from(userTable).where(eq(userTable.email, EMAIL));
    await db.update(userTable).set({ plan: "pro" }).where(eq(userTable.id, u!.id));
    const { key } = await createApiKey(u!.id, "ci");
    await createTestModel(u!.id); // its provider-side deletion fails, so the run stops half-way

    const meRequest = () => new NextRequest(`${APP}/api/me`, { headers: { cookie } });
    const keyRequest = () => new NextRequest(`${APP}/api/v1/models`, { headers: { authorization: `Bearer ${key}` } });
    expect((await resolveRequestAuth(meRequest(), "user")).user?.id).toBe(u!.id);
    expect((await authenticateApiKey(keyRequest()))?.user.id).toBe(u!.id);

    await requestAccountDeletion(u!);
    const token = lastEmailUrl("deletion_confirm_request").searchParams.get("token")!;
    await expect(confirmAccountDeletion(token)).rejects.toMatchObject({ code: "provider_error" });

    const [locked] = await db.select().from(userTable).where(eq(userTable.id, u!.id));
    expect(locked).toMatchObject({ banned: true, deletedAt: expect.any(Date) });
    expect((await resolveRequestAuth(meRequest(), "user")).user).toBeNull();
    expect(await authenticateApiKey(keyRequest())).toBeNull();
    const again = await signIn(EMAIL);
    expect(again.headers.get("location")).toBe(`${APP}/login?error=ACCOUNT_DELETED`);
  });
});
