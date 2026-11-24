/**
 * SEC-2 / PAY-4 gates (dev mailbox + mock checkout + demo banner in production), SEC-13 (shared model
 * DTO without the owner's photo), SEC-18 (rate limits on account export and share creation).
 */
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportGet } from "@/app/api/account/export/route";
import { GET as latestEmailGet } from "@/app/api/dev/emails/latest/route";
import { POST as shareCreate } from "@/app/api/share/route";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { getEnv, resetEnvCache } from "@/lib/env";
import { assertMockPayments } from "@/server/billing/mock-checkout";
import { isDevMailboxEnabled } from "@/server/email/dev-mailbox";
import { toModelDTO } from "@/server/models/service";
import { checkRateLimit } from "@/server/rate-limit";
import { callRoute, createTestDb, createTestJob, createTestMedia, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml" })), sendEmailSafe: vi.fn() }));

const STRONG = "k3Jx9-Qw7_ZpL2mN8vB4cR6tY1uH5sD0aF7gE3iO";

function stub(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  resetEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("SEC-2: production gates", () => {
  const prodAllMock = { NODE_ENV: "production", BETTER_AUTH_SECRET: STRONG, MOCK_PROVIDERS: "true" };
  const prodMockAiRealPayments = {
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: STRONG,
    MOCK_PROVIDERS: "false",
    AI_PROVIDER: "mock",
    PAYMENT_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_1",
    STRIPE_WEBHOOK_SECRET: "whsec_1",
    EMAIL_PROVIDER: "mock",
  };

  it("keeps the dev mailbox and mock checkout for an all-mock demo", async () => {
    stub(prodAllMock);
    expect(isDevMailboxEnabled()).toBe(true);
    expect(() => assertMockPayments()).not.toThrow();
  });

  it("404s the public mailbox when real payments run next to mock email (sign-in links stay private)", async () => {
    stub(prodMockAiRealPayments);
    expect(isDevMailboxEnabled()).toBe(false);
    const res = await latestEmailGet(new NextRequest("http://localhost:3000/api/dev/emails/latest?to=admin@example.com"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(404);
    expect(() => assertMockPayments()).toThrow(expect.objectContaining({ code: "not_found" }));
  });

  it("shows a demo banner naming every mock provider", () => {
    stub(prodAllMock);
    const env = getEnv();
    const html = renderToStaticMarkup(DemoModeBanner({ mocked: env.demoBanner ? env.mockedProviders : null }));
    expect(html).toContain("Demo mode — mock providers.");
    expect(html).toMatch(/placeholders.*simulated.*\/dev\/emails/);
    expect(DemoModeBanner({ mocked: [] })).toBeNull();
    expect(DemoModeBanner({ mocked: null })).toBeNull();
  });
});

describe("SEC-13: shared models don't expose the owner's photos", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("omits the cover (a training-photo thumbnail) and the training job for viewers who aren't the owner", async () => {
    const owner = await createTestUser();
    const viewer = await createTestUser();
    const job = await createTestJob(owner.id);
    const model = await createTestModel(owner.id, { coverMediaKey: `users/${owner.id}/training/x.jpg`, trainingJobId: job.id });
    const own = await toModelDTO(model, owner.id);
    expect(own.coverUrl).toEqual(expect.any(String));
    expect(own.trainingJobId).toBe(job.id);
    const shared = await toModelDTO(model, viewer.id);
    expect(shared).toMatchObject({ shared: true, coverUrl: null, trainingJobId: null });
  });
});

describe("SEC-18: rate limits", () => {
  beforeEach(async () => {
    await createTestDb();
    sessionMock.reset();
  });

  it("limits account exports per user", async () => {
    const user = await createTestUser();
    sessionMock.setUser(user);
    expect((await callRoute(exportGet, { url: "/api/account/export" })).status).toBe(200);
    await checkRateLimit("exportsPerHour", `user:${user.id}`, 4);
    expect((await callRoute(exportGet, { url: "/api/account/export" })).status).toBe(429);
  });

  it("limits share-link creation per user", async () => {
    const user = await createTestUser();
    sessionMock.setUser(user);
    const media = await createTestMedia(user.id);
    expect((await callRoute(shareCreate, { body: { mediaId: media.id } })).status).toBe(200);
    await checkRateLimit("sharesPerHour", `user:${user.id}`, 99);
    expect((await callRoute(shareCreate, { body: { mediaId: media.id } })).status).toBe(429);
  });
});
