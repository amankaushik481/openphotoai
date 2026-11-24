import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailOutbox } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createTestDb } from "../../helpers/db";

vi.mock("@/providers/registry", () => ({ getEmailProvider: () => createMockEmailProvider() }));
vi.mock("@/server/auth/session", () => ({
  resolveRequestAuth: async () => ({ user: null, apiKey: null }),
}));

const { sendEmail } = await import("@/server/email");
const { isDevMailboxEnabled, listDevEmails, getDevEmail } = await import("@/server/email/dev-mailbox");
const { GET } = await import("@/app/api/dev/emails/latest/route");

const ENV_KEYS = ["NODE_ENV", "MOCK_PROVIDERS", "EMAIL_PROVIDER", "RESEND_API_KEY", "AI_PROVIDER", "PAYMENT_PROVIDER"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
}

const latest = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/api/dev/emails/latest?${query}`), { params: Promise.resolve({}) });

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(() => {
  setEnv(savedEnv);
});

describe("dev mailbox (mock provider)", () => {
  it("returns the newest email for an address with its links", async () => {
    await sendEmail("welcome", "tester@example.com", { name: "T" });
    const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2Fapp";
    await sendEmail("magic_link", "Tester@Example.com", { url });
    await sendEmail("welcome", "other@example.com", { name: "O" });

    const res = await latest("to=tester@example.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template).toBe("magic_link");
    expect(body.links[0]).toBe(url);
    expect(body.subject).toContain("sign-in link");
    expect(body.text).toContain(url);
    expect(body.html).toContain("abc");

    const welcome = await (await latest("to=tester@example.com&template=welcome")).json();
    expect(welcome.template).toBe("welcome");
  });

  it("404s when there is no email and 400s without `to`", async () => {
    expect((await latest("to=nobody@example.com")).status).toBe(404);
    expect((await latest("")).status).toBe(400);
  });

  it("lists and reads emails", async () => {
    const { id } = await sendEmail("report_received", "r@example.com", { reportId: "rpt_9" });
    expect((await listDevEmails()).map((e) => e.id)).toContain(id);
    expect((await getDevEmail(id))?.subject).toContain("rpt_9");
    expect(await getDevEmail("eml_missing")).toBeNull();
  });
});

describe("dev mailbox is unavailable unless the mock provider is active", () => {
  it("404s with the Resend provider", async () => {
    await db.insert(emailOutbox).values({ to: "t@example.com", subject: "s", template: "welcome", html: "<p/>", status: "sent" });
    setEnv({ MOCK_PROVIDERS: "false", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", AI_PROVIDER: "mock", PAYMENT_PROVIDER: "mock" });

    expect(isDevMailboxEnabled()).toBe(false);
    const res = await latest("to=t@example.com");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
    await expect(listDevEmails()).rejects.toMatchObject({ code: "not_found" });
  });

  it("stays off in production when mock email is only the fallback for a missing RESEND_API_KEY", () => {
    setEnv({ NODE_ENV: "production", MOCK_PROVIDERS: "false", EMAIL_PROVIDER: undefined, RESEND_API_KEY: undefined, AI_PROVIDER: "mock", PAYMENT_PROVIDER: "mock" });
    expect(isDevMailboxEnabled()).toBe(false);

    setEnv({ EMAIL_PROVIDER: "mock" });
    expect(isDevMailboxEnabled()).toBe(true);
  });
});
