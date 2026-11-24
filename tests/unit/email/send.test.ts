import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { createMockEmailProvider } from "@/providers/email/mock";
import type { EmailProvider } from "@/providers/types";
import { AppError } from "@/server/http";
import { createTestDb, createTestUser } from "../../helpers/db";

const registry = vi.hoisted(() => ({ provider: null as unknown }));
vi.mock("@/providers/registry", () => ({
  getEmailProvider: () => {
    if (!registry.provider) throw new Error("no email provider configured");
    return registry.provider;
  },
}));

const { sendEmail, sendEmailSafe } = await import("@/server/email");

function fakeProvider(name: EmailProvider["name"], send: EmailProvider["send"]): EmailProvider {
  return { name, send: vi.fn(send) };
}

const failing = () => fakeProvider("resend", async () => Promise.reject(new Error("Resend rate_limit_exceeded (429): slow down")));

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
  registry.provider = createMockEmailProvider();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rowById = async (id: string) => (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)))[0]!;

describe("sendEmail", () => {
  it("records a mocked email in the outbox with html, text and metadata", async () => {
    const user = await createTestUser({ name: "Ada" });
    const result = await sendEmail("welcome", user.email, { name: "Ada" }, { userId: user.id });

    expect(result.status).toBe("mocked");
    const row = await rowById(result.id);
    expect(row).toMatchObject({
      userId: user.id,
      to: user.email,
      template: "welcome",
      status: "mocked",
      error: null,
    });
    expect(row.subject).toContain("Welcome");
    expect(row.html).toContain("Welcome, Ada!");
    expect(row.text).toContain("Welcome, Ada!");
    expect(row.providerMessageId).toMatch(/^mock_/);
  });

  it("passes the rendered message to the provider with a support reply-to", async () => {
    const provider = fakeProvider("resend", async () => ({ id: "re_1" }));
    registry.provider = provider;
    const result = await sendEmail("report_received", "reporter@example.com", { reportId: "rpt_1" });

    expect(result.status).toBe("sent");
    const msg = vi.mocked(provider.send).mock.calls[0]![0];
    expect(msg.to).toBe("reporter@example.com");
    expect(msg.subject).toContain("rpt_1");
    expect(msg.html).toContain("rpt_1");
    expect(msg.text).toContain("rpt_1");
    expect(msg.replyTo).toBeTruthy();
    expect(msg.tags).toEqual({ template: "report_received" });
    expect((await rowById(result.id)).providerMessageId).toBe("re_1");
  });

  it("keeps secret links in mocked emails (dev mailbox) but redacts them for real deliveries", async () => {
    const url = "https://app.test/api/auth/magic-link/verify?token=SECRET123&callbackURL=%2Fapp";
    const mocked = await sendEmail("magic_link", "a@example.com", { url });
    const mockedRow = await rowById(mocked.id);
    expect(mockedRow.html).toContain("SECRET123");

    registry.provider = fakeProvider("resend", async () => ({ id: "re_2" }));
    const sent = await sendEmail("magic_link", "a@example.com", { url });
    const sentRow = await rowById(sent.id);
    expect(sentRow.html).not.toContain("SECRET123");
    expect(sentRow.text).not.toContain("SECRET123");
    expect(sentRow.html).toContain("[redacted]");
  });

  it("records failures of non-critical templates and resolves", async () => {
    registry.provider = failing();
    const result = await sendEmail("model_ready", "a@example.com", { name: "A", modelName: "M", url: "https://app.test" });

    expect(result.status).toBe("failed");
    const row = await rowById(result.id);
    expect(row.status).toBe("failed");
    expect(row.error).toContain("rate_limit_exceeded");
    expect(row.providerMessageId).toBeNull();
  });

  it("treats a missing provider as a delivery failure", async () => {
    registry.provider = null;
    const result = await sendEmail("welcome", "a@example.com", { name: "A" });
    expect(result.status).toBe("failed");
    expect((await rowById(result.id)).error).toContain("no email provider configured");
  });

  it.each(["magic_link", "deletion_confirm_request"] as const)("throws when critical template %s fails, after recording it", async (template) => {
    registry.provider = failing();
    const props = template === "magic_link" ? { url: "https://app.test/x" } : { url: "https://app.test/x", expiresInHours: 24 };

    const error = await sendEmail(template, "a@example.com", props as never).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("provider_error");

    const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.template, template));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("failed");
  });
});

describe("sendEmailSafe", () => {
  it("resolves to null instead of throwing for a failed critical email", async () => {
    registry.provider = failing();
    await expect(sendEmailSafe("magic_link", "a@example.com", { url: "https://app.test/x" })).resolves.toBeNull();
  });

  it("returns the outbox row for a successful send", async () => {
    const result = await sendEmailSafe("welcome", "a@example.com", { name: "A" });
    expect(result?.status).toBe("mocked");
  });

  it("never throws even when the outbox cannot be written", async () => {
    // A database without migrations: the email_outbox insert fails.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    setDb(drizzle(new PGlite()) as never);
    await expect(sendEmailSafe("welcome", "a@example.com", { name: "A" })).resolves.toBeNull();
  });
});
