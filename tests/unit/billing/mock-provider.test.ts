import { describe, expect, it } from "vitest";
import { PaymentWebhookError } from "@/providers/payment/errors";
import {
  buildMockEvent,
  createMockPaymentProvider,
  decodeMockCheckoutId,
  encodeMockCheckoutId,
  MOCK_CHECKOUT_TTL_MS,
  MOCK_PAYMENT_SIGNATURE_HEADER,
  mockCheckoutEvents,
  mockWebhookHeaders,
  serializeMockEvent,
  signMockPayload,
} from "@/providers/payment/mock";
import type { PaymentEvent } from "@/providers/types";

const provider = createMockPaymentProvider();
const webhook = (rawBody: string, headers: Headers = mockWebhookHeaders(rawBody)) =>
  provider.parseWebhook({ headers, rawBody, url: "http://localhost:3000/api/webhooks/payments/mock" });

describe("mock checkout ids", () => {
  it("createCheckout returns a mock-checkout URL with a signed checkout id carrying user + item", async () => {
    const { url, checkoutId } = await provider.createCheckout({
      userId: "usr_1",
      email: "a@example.com",
      customerId: null,
      item: { type: "credit_pack", packId: "credits_100" },
      successUrl: "http://localhost:3000/app/billing?success=1",
      cancelUrl: "http://localhost:3000/app/billing?canceled=1",
    });
    expect(url).toBe(`http://localhost:3000/billing/mock-checkout?session=${encodeURIComponent(checkoutId)}`);
    expect(decodeMockCheckoutId(checkoutId)).toMatchObject({
      userId: "usr_1",
      customerId: "mock_cus_usr_1",
      item: { type: "credit_pack", packId: "credits_100" },
    });
  });

  it("reuses an existing customer id and makes every checkout unique", () => {
    const item = { type: "plan", planId: "pro", interval: "year" } as const;
    const a = encodeMockCheckoutId({ userId: "usr_1", customerId: "cus_9", item });
    const b = encodeMockCheckoutId({ userId: "usr_1", customerId: "cus_9", item });
    expect(a).not.toBe(b);
    expect(decodeMockCheckoutId(a)?.customerId).toBe("cus_9");
  });

  it("rejects forged, tampered, malformed and expired checkout ids", () => {
    const id = encodeMockCheckoutId({ userId: "usr_1", customerId: "cus_1", item: { type: "credit_pack", packId: "credits_100" } });
    const [payload, sig] = id.slice(4).split(".");

    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), u: "usr_attacker" }),
    ).toString("base64url");
    expect(decodeMockCheckoutId(`mcs_${forgedPayload}.${sig}`)).toBeNull();
    expect(decodeMockCheckoutId(`mcs_${payload}.${sig!.slice(0, -2)}xx`)).toBeNull();
    expect(decodeMockCheckoutId(`mcs_${payload}`)).toBeNull();
    expect(decodeMockCheckoutId("cs_test_123")).toBeNull();
    expect(decodeMockCheckoutId(id, new Date(Date.now() + MOCK_CHECKOUT_TTL_MS + 60_000))).toBeNull();
    expect(decodeMockCheckoutId(id)).not.toBeNull();
  });
});

describe("mock webhooks", () => {
  it("verifies the x-mock-signature HMAC and revives dates", async () => {
    const event = buildMockEvent("subscription.updated", {
      createdAt: new Date("2026-11-01T00:00:00Z"),
      subscription: {
        subscriptionId: "sub_1",
        customerId: "cus_1",
        userId: "usr_1",
        planId: "pro",
        interval: "month",
        status: "active",
        currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
      },
    });
    const parsed = await webhook(serializeMockEvent(event));
    expect(parsed).toEqual(event);
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a missing or forged signature and a body signed for something else", async () => {
    const body = serializeMockEvent(buildMockEvent("ignored", { rawType: "x" }));
    await expect(webhook(body, new Headers())).rejects.toBeInstanceOf(PaymentWebhookError);
    await expect(webhook(body, new Headers({ [MOCK_PAYMENT_SIGNATURE_HEADER]: "0".repeat(64) }))).rejects.toThrow(/signature/);
    const tampered = body.replace('"x"', '"y"');
    await expect(webhook(tampered, new Headers({ [MOCK_PAYMENT_SIGNATURE_HEADER]: signMockPayload(body) }))).rejects.toThrow(/signature/);
    const err = await webhook(body, new Headers()).catch((e: PaymentWebhookError) => e);
    expect(err.retryable).toBe(false);
  });

  it("rejects signed bodies that are not valid payment events", async () => {
    await expect(webhook("not json")).rejects.toThrow(/JSON/);
    await expect(webhook(JSON.stringify({ type: "invoice.paid", eventId: "e" }))).rejects.toThrow(/valid payment event/);
  });
});

describe("mockCheckoutEvents", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  it("emits checkout.completed for a credit pack, with deterministic ids", () => {
    const checkout = decodeMockCheckoutId(
      encodeMockCheckoutId({ userId: "usr_1", customerId: "cus_1", item: { type: "credit_pack", packId: "credits_1500" } }),
    )!;
    const events = mockCheckoutEvents(checkout, now);
    expect(events).toEqual([
      expect.objectContaining({
        type: "checkout.completed",
        mode: "payment",
        userId: "usr_1",
        customerId: "cus_1",
        checkoutId: checkout.checkoutId,
        creditPackId: "credits_1500",
        amountCents: 9900,
        createdAt: now,
      }),
    ]);
    expect(mockCheckoutEvents(checkout, now)[0]!.eventId).toBe(events[0]!.eventId);
  });

  it("emits checkout + subscription + invoice events for a yearly plan", () => {
    const checkout = decodeMockCheckoutId(
      encodeMockCheckoutId({ userId: "usr_1", customerId: "cus_1", item: { type: "plan", planId: "starter", interval: "year" } }),
    )!;
    const [completed, created, invoice] = mockCheckoutEvents(checkout, now) as [
      Extract<PaymentEvent, { type: "checkout.completed" }>,
      Extract<PaymentEvent, { type: "subscription.updated" }>,
      Extract<PaymentEvent, { type: "invoice.paid" }>,
    ];
    expect(completed).toMatchObject({ mode: "subscription", planId: "starter", interval: "year", amountCents: 15000 });
    expect(created.subscription).toMatchObject({
      subscriptionId: completed.subscriptionId,
      status: "active",
      currentPeriodEnd: new Date("2027-11-01T00:00:00Z"),
    });
    expect(invoice).toMatchObject({
      subscriptionId: completed.subscriptionId,
      billingReason: "subscription_create",
      amountCents: 15000,
      userId: "usr_1",
    });
  });
});
