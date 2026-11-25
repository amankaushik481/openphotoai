import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkoutRoute } from "@/app/api/billing/checkout/route";
import { POST as mockCancelRoute } from "@/app/api/billing/mock/cancel/route";
import { POST as mockCompleteRoute } from "@/app/api/billing/mock/complete/route";
import { POST as portalRoute } from "@/app/api/billing/portal/route";
import { GET as subscriptionRoute } from "@/app/api/billing/subscription/route";
import { POST as webhookRoute } from "@/app/api/webhooks/payments/[provider]/route";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { RATE_LIMITS } from "@/config/rate-limits";
import { resetEnvCache } from "@/lib/env";
import { buildMockEvent, mockWebhookHeaders, serializeMockEvent } from "@/providers/payment/mock";
import { setProviderOverrides } from "@/providers/registry";
import type { PaymentEvent } from "@/providers/types";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";
import {
  invoicePaid,
  packCheckout,
  readPayments,
  readSubscription,
  readUser,
  readWebhookEvent,
  receipts,
} from "./fixtures";

vi.mock("@/server/auth/session", () => sessionMock);

let u: UserRow;
beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
  sessionMock.reset();
  u = await createTestUser({ credits: 0 });
  sessionMock.setUser(u);
});

const ENV_KEYS = ["PAYMENT_PROVIDER", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  resetEnvCache();
  setProviderOverrides(null);
});

function useStripeEnv() {
  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
  resetEnvCache();
}

async function startCheckout(item: unknown) {
  return callRoute(checkoutRoute, { url: "/api/billing/checkout", body: { item } });
}

function checkoutIdFrom(url: string): string {
  return new URL(url).searchParams.get("session")!;
}

function postWebhook(provider: string, event: PaymentEvent, headers?: Record<string, string>) {
  const body = serializeMockEvent(event);
  return callRoute(webhookRoute, {
    url: `/api/webhooks/payments/${provider}`,
    params: { provider },
    body,
    headers: headers ?? Object.fromEntries(mockWebhookHeaders(body).entries()),
  });
}

describe("POST /api/billing/checkout", () => {
  it("requires a signed-in user", async () => {
    sessionMock.setUser(null);
    expect((await startCheckout({ type: "credit_pack", packId: "credits_100" })).status).toBe(401);
  });

  it("validates the item", async () => {
    for (const item of [
      { type: "plan", planId: "free", interval: "month" },
      { type: "plan", planId: "pro", interval: "week" },
      { type: "credit_pack" },
      { type: "gift_card" },
    ]) {
      const res = await startCheckout(item);
      expect(res.status, JSON.stringify(item)).toBe(400);
      expect(res.json.error.code).toBe("validation_error");
    }
    const unknownPack = await startCheckout({ type: "credit_pack", packId: "credits_42" });
    expect(unknownPack.status).toBe(400);
    expect(unknownPack.json.error.message).toMatch(/Unknown credit pack/);
  });

  it("returns the provider checkout URL", async () => {
    const res = await startCheckout({ type: "plan", planId: "pro", interval: "year" });
    expect(res.status).toBe(200);
    expect(res.json.url).toMatch(/^http:\/\/localhost:3000\/billing\/mock-checkout\?session=mcs_/);
  });

  it("blocks a second subscription to the plan the user already has", async () => {
    await postWebhook("mock", invoicePaid({ userId: u.id }));
    const res = await startCheckout({ type: "plan", planId: "pro", interval: "month" });
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/already subscribed to the Pro plan/);
    expect((await startCheckout({ type: "plan", planId: "studio", interval: "month" })).status).toBe(200);
    expect((await startCheckout({ type: "credit_pack", packId: "credits_100" })).status).toBe(200);
  });
});

describe("POST /api/billing/portal", () => {
  it("needs a billing customer first", async () => {
    const res = await callRoute(portalRoute, { url: "/api/billing/portal", method: "POST" });
    expect(res.status).toBe(409);
  });

  it("returns the (mock) portal URL once the user has paid", async () => {
    await postWebhook("mock", packCheckout(u.id));
    const res = await callRoute(portalRoute, { url: "/api/billing/portal", method: "POST" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ url: "http://localhost:3000/app/billing?mockPortal=1" });
  });
});

describe("billing rate limit", () => {
  it("caps checkout + portal sessions per user per minute (shared bucket)", async () => {
    const { limit } = RATE_LIMITS.billingPerMinute;
    for (let i = 0; i < limit - 1; i++) {
      expect((await startCheckout({ type: "credit_pack", packId: "credits_100" })).status).toBe(200);
    }
    expect((await callRoute(portalRoute, { url: "/api/billing/portal", method: "POST" })).status).toBe(409);
    const limited = await startCheckout({ type: "credit_pack", packId: "credits_100" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await callRoute(portalRoute, { url: "/api/billing/portal", method: "POST" })).status).toBe(429);

    // Per user: someone else is unaffected.
    sessionMock.setUser(await createTestUser());
    expect((await startCheckout({ type: "credit_pack", packId: "credits_100" })).status).toBe(200);
  });
});

describe("GET /api/billing/subscription", () => {
  it("returns the free plan without a subscription", async () => {
    const res = await callRoute(subscriptionRoute, { url: "/api/billing/subscription" });
    expect(res.json).toEqual({
      subscription: null,
      plan: "free",
      hasPaid: false,
      canManageBilling: false,
      provider: "mock",
    });
  });

  it("returns the current subscription", async () => {
    await postWebhook("mock", invoicePaid({ userId: u.id, interval: "year" }));
    const res = await callRoute(subscriptionRoute, { url: "/api/billing/subscription" });
    expect(res.json).toMatchObject({
      plan: "pro",
      hasPaid: true,
      canManageBilling: true,
      subscription: {
        planId: "pro",
        interval: "year",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: expect.any(String),
      },
    });
  });
});

describe("POST /api/webhooks/payments/[provider]", () => {
  it("404s for a provider other than the configured one", async () => {
    const res = await postWebhook("stripe", packCheckout(u.id));
    expect(res.status).toBe(404);
    expect((await readUser(u.id)).credits).toBe(0);
  });

  it("400s on a bad signature", async () => {
    const res = await postWebhook("mock", packCheckout(u.id), { "x-mock-signature": "deadbeef" });
    expect(res.status).toBe(400);
    expect((await readUser(u.id)).credits).toBe(0);
  });

  it("applies a signed event once and acknowledges duplicates", async () => {
    const event = packCheckout(u.id);
    const first = await postWebhook("mock", event);
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ received: true });
    const again = await postWebhook("mock", event);
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ received: true, duplicate: true });
    expect((await readUser(u.id)).credits).toBe(500);
  });

  it("acknowledges ignored events", async () => {
    const res = await postWebhook("mock", buildMockEvent("ignored", { rawType: "customer.created" }));
    expect(res.json).toEqual({ received: true, ignored: true });
  });

  it("answers 500 when the event must be redelivered, then processes the redelivery", async () => {
    const invoice = invoicePaid({ customerId: "cus_unknown", createdAt: new Date() });
    const res = await postWebhook("mock", invoice);
    expect(res.status).toBe(500);
    expect(await readWebhookEvent(invoice.eventId)).toMatchObject({ processedAt: null, error: expect.any(String) });

    await postWebhook("mock", packCheckout(u.id, { customerId: "cus_unknown" }));
    const retry = await postWebhook("mock", invoice);
    expect(retry.status).toBe(200);
    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 1100 });
  });

  it("answers 409 (so the provider redelivers) while another delivery holds the event (PAY-5)", async () => {
    const event = packCheckout(u.id);
    await db.insert(webhookEvents).values({ source: "payment:mock", eventId: event.eventId, type: event.type });
    const res = await postWebhook("mock", event);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("conflict");
    expect((await readUser(u.id)).credits).toBe(0);
  });

  it("404s the mock endpoint when Stripe is configured", async () => {
    useStripeEnv();
    const res = await postWebhook("mock", packCheckout(u.id));
    expect(res.status).toBe(404);
  });
});

describe("mock checkout end-to-end", () => {
  it("credit pack: checkout → mock pay → credits, receipt; paying twice is a no-op", async () => {
    const { json } = await startCheckout({ type: "credit_pack", packId: "credits_100" });
    const checkoutId = checkoutIdFrom(json.url);

    const paid = await callRoute(mockCompleteRoute, { url: "/api/billing/mock/complete", body: { checkoutId } });
    expect(paid.status).toBe(200);
    expect(paid.json).toEqual({
      ok: true,
      redirectUrl: expect.stringMatching(/^\/app\/billing\?success=1&since=\d{13}$/),
    });
    expect(await readUser(u.id)).toMatchObject({ credits: 100, hasPaid: true, stripeCustomerId: `mock_cus_${u.id}` });

    expect(
      (await callRoute(mockCompleteRoute, { url: "/api/billing/mock/complete", body: { checkoutId } })).status,
    ).toBe(200);
    expect((await readUser(u.id)).credits).toBe(100);
    expect(await readPayments(u.id)).toHaveLength(1);
    expect(await receipts(u.email)).toHaveLength(1);
  });

  it("plan: subscription active, credits granted, portal + cancel through the test portal", async () => {
    const { json } = await startCheckout({ type: "plan", planId: "starter", interval: "month" });
    await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(json.url) },
    });
    expect(await readUser(u.id)).toMatchObject({ plan: "starter", credits: 200 });

    const summary = await callRoute(subscriptionRoute, { url: "/api/billing/subscription" });
    expect(summary.json.subscription).toMatchObject({ planId: "starter", status: "active" });

    const canceled = await callRoute(mockCancelRoute, { url: "/api/billing/mock/cancel", method: "POST" });
    expect(canceled.json).toEqual({ canceled: 1 });
    expect(await readUser(u.id)).toMatchObject({ plan: "free", credits: 200 });
  });

  it("upgrading cancels the previous plan", async () => {
    const first = await startCheckout({ type: "plan", planId: "starter", interval: "month" });
    await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(first.json.url) },
    });
    const second = await startCheckout({ type: "plan", planId: "pro", interval: "year" });
    await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(second.json.url) },
    });

    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 200 + 7200 });
    const summary = await callRoute(subscriptionRoute, { url: "/api/billing/subscription" });
    expect(summary.json.subscription).toMatchObject({ planId: "pro", interval: "year", status: "active" });
  });

  it("rejects another user's checkout, forged ids and duplicate plan checkouts", async () => {
    const { json } = await startCheckout({ type: "credit_pack", packId: "credits_100" });
    const checkoutId = checkoutIdFrom(json.url);

    sessionMock.setUser(await createTestUser());
    const stolen = await callRoute(mockCompleteRoute, { url: "/api/billing/mock/complete", body: { checkoutId } });
    expect(stolen.status).toBe(403);
    const forged = await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: `${checkoutId}x` },
    });
    expect(forged.status).toBe(400);
    expect((await readUser(u.id)).credits).toBe(0);

    sessionMock.setUser(u);
    const a = await startCheckout({ type: "plan", planId: "pro", interval: "month" });
    const b = await startCheckout({ type: "plan", planId: "pro", interval: "month" });
    await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(a.json.url) },
    });
    const dup = await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(b.json.url) },
    });
    expect(dup.status).toBe(409);
    expect((await readUser(u.id)).credits).toBe(600);
  });

  it("requires sign-in and is 404 outside mock mode", async () => {
    const { json } = await startCheckout({ type: "credit_pack", packId: "credits_100" });
    sessionMock.setUser(null);
    expect(
      (await callRoute(mockCompleteRoute, { url: "/api/billing/mock/complete", body: { checkoutId: "x" } })).status,
    ).toBe(401);

    sessionMock.setUser(u);
    useStripeEnv();
    const res = await callRoute(mockCompleteRoute, {
      url: "/api/billing/mock/complete",
      body: { checkoutId: checkoutIdFrom(json.url) },
    });
    expect(res.status).toBe(404);
    expect((await callRoute(mockCancelRoute, { url: "/api/billing/mock/cancel", method: "POST" })).status).toBe(404);
    expect(await readSubscription()).toBeUndefined();
  });
});
