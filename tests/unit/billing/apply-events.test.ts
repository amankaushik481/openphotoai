import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { buildMockEvent, decodeMockCheckoutId, encodeMockCheckoutId, mockCheckoutEvents } from "@/providers/payment/mock";
import { setProviderOverrides } from "@/providers/registry";
import { applyPaymentEvent, RetryablePaymentEventError } from "@/server/billing/events";
import { debitForJob } from "@/server/credits/ledger";
import { createTestDb, createTestUser } from "../../helpers/db";
import {
  at,
  invoicePaid,
  packCheckout,
  readLedger,
  readPayments,
  readSubscription,
  readUser,
  readWebhookEvent,
  receipts,
  sub,
  subscriptionCheckout,
  T0,
} from "./fixtures";

const ledgerFault = vi.hoisted(() => ({ failNext: false }));
vi.mock("@/server/credits/ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/credits/ledger")>();
  return {
    ...actual,
    applyCredit: vi.fn(async (...args: Parameters<typeof actual.applyCredit>) => {
      if (ledgerFault.failNext) {
        ledgerFault.failNext = false;
        throw new Error("connection reset");
      }
      return actual.applyCredit(...args);
    }),
  };
});

beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
  ledgerFault.failNext = false;
});

describe("credit pack purchase", () => {
  it("grants credits once, records the payment, marks the user paid and emails a receipt", async () => {
    const u = await createTestUser({ credits: 5 });
    const event = packCheckout(u.id);

    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "processed" });
    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "duplicate" });

    const after = await readUser(u.id);
    expect(after).toMatchObject({ credits: 505, hasPaid: true, stripeCustomerId: "cus_test", plan: "free" });
    const ledger = await readLedger(u.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 500, reason: "purchase", idempotencyKey: "payment:cs_pack_1" });
    const [payment] = await readPayments(u.id);
    expect(payment).toMatchObject({
      provider: "mock",
      providerPaymentId: "cs_pack_1",
      kind: "credit_pack",
      productId: "credits_500",
      amountCents: 3900,
      credits: 500,
      status: "paid",
    });
    expect(ledger[0]!.paymentId).toBe(payment!.id);
    expect(await receipts(u.email)).toHaveLength(1);
    expect((await readWebhookEvent(event.eventId))?.processedAt).toBeInstanceOf(Date);
  });

  it("does not grant twice when the same checkout arrives under another event id", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id, { eventId: "evt_a" }));
    expect(await applyPaymentEvent("mock", packCheckout(u.id, { eventId: "evt_b" }))).toEqual({ status: "processed" });
    expect((await readUser(u.id)).credits).toBe(500);
    expect(await readPayments(u.id)).toHaveLength(1);
    expect(await receipts(u.email)).toHaveLength(1);
  });

  it("fails loudly (and records the error) for an unknown pack", async () => {
    const u = await createTestUser();
    const event = packCheckout(u.id, { creditPackId: "credits_nope" });
    await expect(applyPaymentEvent("mock", event)).rejects.toThrow(/unknown credit pack/);
    expect(await readWebhookEvent(event.eventId)).toMatchObject({ processedAt: null, error: expect.stringContaining("unknown credit pack") });
    expect((await readUser(u.id)).credits).toBe(0);
  });

  it("ignores 'ignored' events without touching webhook_events", async () => {
    const event = buildMockEvent("ignored", { rawType: "customer.created" });
    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "ignored" });
    expect(await readWebhookEvent(event.eventId)).toBeUndefined();
  });
});

describe("subscriptions", () => {
  it("full checkout flow: plan set, monthly credits granted once by invoice.paid (not checkout)", async () => {
    const u = await createTestUser();
    const checkout = decodeMockCheckoutId(
      encodeMockCheckoutId({ userId: u.id, customerId: "cus_test", item: { type: "plan", planId: "pro", interval: "month" } }),
    )!;
    const events = mockCheckoutEvents(checkout, T0);
    expect(events.map((e) => e.type)).toEqual(["checkout.completed", "subscription.updated", "invoice.paid"]);

    await applyPaymentEvent("mock", events[0]!);
    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 0 });
    for (const e of events.slice(1)) await applyPaymentEvent("mock", e);
    for (const e of events) expect((await applyPaymentEvent("mock", e)).status).toBe("duplicate");

    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 600, hasPaid: true, stripeCustomerId: "cus_test" });
    const ledger = await readLedger(u.id);
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([[600, "subscription_grant"]]);
    const subscriptionId = events[2]!.type === "invoice.paid" ? events[2]!.subscriptionId : "";
    expect(await readSubscription(subscriptionId)).toMatchObject({
      userId: u.id,
      planId: "pro",
      interval: "month",
      status: "active",
      currentPeriodEnd: new Date("2026-12-01T10:00:00Z"),
      cancelAtPeriodEnd: false,
    });
    const [payment] = await readPayments(u.id);
    expect(payment).toMatchObject({ kind: "subscription", productId: "pro_month", credits: 600, amountCents: 3900 });
    expect(await receipts(u.email)).toHaveLength(1);
  });

  it("yearly plans grant 12× the monthly credits; renewals grant again", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, interval: "year", amountCents: 39000 }));
    expect((await readUser(u.id)).credits).toBe(7200);
    await applyPaymentEvent(
      "mock",
      invoicePaid({ userId: u.id, interval: "year", invoiceId: "in_2", billingReason: "subscription_cycle", createdAt: at(365 * 86400) }),
    );
    expect((await readUser(u.id)).credits).toBe(14400);
  });

  it("proration invoices (subscription_update) record the payment but grant no credits", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id }));
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, invoiceId: "in_2", billingReason: "subscription_update", amountCents: 1200 }));
    expect((await readUser(u.id)).credits).toBe(600);
    expect(await readPayments(u.id)).toHaveLength(2);
  });

  it("handles invoice.paid arriving before checkout.completed / subscription.created", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, createdAt: at(2) }));
    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 600, hasPaid: true });
    expect(await readSubscription()).toMatchObject({ status: "active", lastEventAt: at(2) });

    // The (older) creation event still says "incomplete": it must not downgrade the paid subscription.
    expect(await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(0), subscription: sub(u.id, { status: "incomplete" }) }))).toMatchObject({
      status: "processed",
      note: "stale event",
    });
    await applyPaymentEvent("mock", subscriptionCheckout(u.id, { createdAt: at(3) }));
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(2), subscription: sub(u.id) }));

    expect(await readUser(u.id)).toMatchObject({ plan: "pro", credits: 600 });
    expect(await readSubscription()).toMatchObject({ status: "active", currentPeriodEnd: new Date("2026-12-01T10:00:00Z") });
    expect(await readLedger(u.id)).toHaveLength(1);
  });

  it("a same-second 'incomplete' never overwrites an active subscription", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id }));
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: T0, subscription: sub(u.id, { status: "incomplete" }) }));
    expect(await readSubscription()).toMatchObject({ status: "active" });
    expect((await readUser(u.id)).plan).toBe("pro");
  });

  it("ignores an out-of-order (older) subscription.updated", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(10), subscription: sub(u.id, { cancelAtPeriodEnd: true }) }));
    const stale = buildMockEvent("subscription.updated", { createdAt: at(5), subscription: sub(u.id, { planId: "starter" }) });
    expect(await applyPaymentEvent("mock", stale)).toEqual({ status: "processed", note: "stale event" });

    expect(await readSubscription()).toMatchObject({ planId: "pro", cancelAtPeriodEnd: true, lastEventAt: at(10) });
    expect((await readUser(u.id)).plan).toBe("pro");
    expect(await readWebhookEvent(stale.eventId)).toMatchObject({ processedAt: expect.any(Date), error: "stale event" });
  });

  it("applies plan changes, period updates and cancel-at-period-end", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(0), subscription: sub(u.id) }));
    await applyPaymentEvent(
      "mock",
      buildMockEvent("subscription.updated", {
        createdAt: at(1),
        subscription: sub(u.id, { planId: "studio", currentPeriodEnd: new Date("2027-01-01T00:00:00Z"), cancelAtPeriodEnd: true }),
      }),
    );
    expect(await readSubscription()).toMatchObject({
      planId: "studio",
      currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
    });
    expect((await readUser(u.id)).plan).toBe("studio");
  });

  it("cancellation drops the user to free; canceled is terminal", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id }));
    await applyPaymentEvent("mock", buildMockEvent("subscription.deleted", { createdAt: at(30), subscription: sub(u.id, { status: "canceled" }) }));
    expect(await readUser(u.id)).toMatchObject({ plan: "free", credits: 600 });
    expect(await readSubscription()).toMatchObject({ status: "canceled", cancelAtPeriodEnd: false });

    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(40), subscription: sub(u.id) }));
    expect(await readSubscription()).toMatchObject({ status: "canceled" });
    expect((await readUser(u.id)).plan).toBe("free");
  });

  it("unpaid drops the plan; past_due keeps it", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(0), subscription: sub(u.id) }));
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(1), subscription: sub(u.id, { status: "past_due" }) }));
    expect((await readUser(u.id)).plan).toBe("pro");
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(2), subscription: sub(u.id, { status: "unpaid" }) }));
    expect((await readUser(u.id)).plan).toBe("free");
  });

  it("invoice.payment_failed marks past_due (plan kept); a later paid invoice reactivates", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id }));
    await applyPaymentEvent(
      "mock",
      buildMockEvent("invoice.payment_failed", { invoiceId: "in_2", subscriptionId: "sub_1", customerId: "cus_test", createdAt: at(100) }),
    );
    expect(await readSubscription()).toMatchObject({ status: "past_due" });
    expect((await readUser(u.id)).plan).toBe("pro");

    await applyPaymentEvent("mock", invoicePaid({ invoiceId: "in_2", billingReason: "subscription_cycle", createdAt: at(200) }));
    expect(await readSubscription()).toMatchObject({ status: "active" });
    expect((await readUser(u.id)).credits).toBe(1200);
  });

  it("a stale payment failure does not override a newer active state", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: at(50), subscription: sub(u.id) }));
    await applyPaymentEvent(
      "mock",
      buildMockEvent("invoice.payment_failed", { invoiceId: "in_0", subscriptionId: "sub_1", customerId: "cus_test", createdAt: at(10) }),
    );
    expect(await readSubscription()).toMatchObject({ status: "active" });
  });

  it("switching plans cancels the superseded subscription and keeps the new plan", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, subscriptionId: "sub_old", invoiceId: "in_old", planId: "starter" }));
    expect((await readUser(u.id)).plan).toBe("starter");

    await applyPaymentEvent("mock", subscriptionCheckout(u.id, { subscriptionId: "sub_new", createdAt: at(60) }));
    expect(await readSubscription("sub_old")).toMatchObject({ status: "canceled" });
    expect(await readSubscription("sub_new")).toMatchObject({ status: "active", planId: "pro" });
    expect((await readUser(u.id)).plan).toBe("pro");
  });
});

/** Revenue as the admin reports compute it: paid rows − fully refunded originals + negative refund rows. */
async function revenueCents(userId: string): Promise<number> {
  return (await readPayments(userId)).reduce((sum, p) => sum + (p.status === "paid" || p.amountCents < 0 ? p.amountCents : 0), 0);
}

describe("refunds", () => {
  it("full refund reverses all credits (balance may go negative) and marks the payment refunded", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await debitForJob({ userId: u.id, jobId: "job_1", amount: 450 });

    const refund = buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 3900, fullyRefunded: true });
    await applyPaymentEvent("mock", refund);
    expect(await applyPaymentEvent("mock", refund)).toEqual({ status: "duplicate" });

    expect((await readUser(u.id)).credits).toBe(-450);
    const reversal = (await readLedger(u.id)).find((l) => l.reason === "purchase_reversal");
    expect(reversal).toMatchObject({ delta: -500, balanceAfter: -450 });
    const rows = await readPayments(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "refunded", amountCents: 3900 });
    expect(await revenueCents(u.id)).toBe(0);
  });

  it("partial refunds add negative refund rows and prorate the credit reversal", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    const partial = buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 1950, fullyRefunded: false });
    await applyPaymentEvent("mock", partial);
    expect((await readUser(u.id)).credits).toBe(250);

    const rows = await readPayments(u.id);
    expect(rows.find((p) => p.providerPaymentId === "cs_pack_1")).toMatchObject({ status: "paid", amountCents: 3900 });
    expect(rows.find((p) => p.amountCents < 0)).toMatchObject({
      providerPaymentId: `cs_pack_1:refund:${partial.eventId}`,
      amountCents: -1950,
      status: "refunded",
      kind: "credit_pack",
      productId: "credits_500",
      credits: -250,
      userId: u.id,
    });
    expect(await revenueCents(u.id)).toBe(1950);

    // Stripe reports the cumulative amount: a second partial refund only records the new part.
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 2950, fullyRefunded: false }));
    expect((await readPayments(u.id)).filter((p) => p.amountCents < 0).map((p) => p.amountCents).sort()).toEqual([-1000, -1950]);
    expect(await revenueCents(u.id)).toBe(950);
  });

  it("a full refund after partial ones records the remainder without double-counting", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 1950, fullyRefunded: false }));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 3900, fullyRefunded: true }));

    expect((await readUser(u.id)).credits).toBe(0);
    expect((await readLedger(u.id)).filter((l) => l.reason === "purchase_reversal").map((l) => l.delta)).toEqual([-250, -250]);
    expect((await readPayments(u.id)).map((p) => p.amountCents).sort((a, b) => a - b)).toEqual([-1950, -1950, 3900]);
    expect(await revenueCents(u.id)).toBe(0);
  });

  it("an older partial refund arriving late changes nothing", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 2000, fullyRefunded: false }));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 1000, fullyRefunded: false }));
    expect((await readPayments(u.id)).filter((p) => p.amountCents < 0).map((p) => p.amountCents)).toEqual([-2000]);
    expect((await readLedger(u.id)).filter((l) => l.reason === "purchase_reversal").map((l) => l.delta)).toEqual([-256]);
  });

  it("refunds subscription invoices by invoice id", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, interval: "year", amountCents: 39000 }));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "in_1", amountRefundedCents: 39000, fullyRefunded: true }));
    expect((await readUser(u.id)).credits).toBe(0);
    expect((await readPayments(u.id))[0]).toMatchObject({ status: "refunded", amountCents: 39000, kind: "subscription" });
  });

  it("a refund for a payment we haven't recorded yet is retried later", async () => {
    const refund = buildMockEvent("payment.refunded", { paymentId: "cs_unknown", amountRefundedCents: 100, fullyRefunded: false });
    await expect(applyPaymentEvent("mock", refund)).rejects.toBeInstanceOf(RetryablePaymentEventError);
    expect(await readWebhookEvent(refund.eventId)).toMatchObject({ processedAt: null, error: expect.stringContaining("cs_unknown") });
  });
});

describe("retries", () => {
  it("invoice.paid for an unknown account fails retryably, then succeeds once the account is known", async () => {
    const u = await createTestUser();
    const invoice = invoicePaid({ customerId: "cus_late" });
    const failure = await applyPaymentEvent("mock", invoice).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(RetryablePaymentEventError);
    expect((failure as RetryablePaymentEventError).status).toBe(500);
    expect(await readWebhookEvent(invoice.eventId)).toMatchObject({ processedAt: null, error: expect.stringContaining("account not known") });
    expect(await readPayments(u.id)).toHaveLength(0);

    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: T0, subscription: sub(u.id, { customerId: "cus_late" }) }));
    expect(await applyPaymentEvent("mock", invoice)).toEqual({ status: "processed" });
    expect(await applyPaymentEvent("mock", invoice)).toEqual({ status: "duplicate" });
    expect(await readUser(u.id)).toMatchObject({ credits: 600, plan: "pro" });
    expect(await readWebhookEvent(invoice.eventId)).toMatchObject({ processedAt: expect.any(Date), error: null });
  });

  it("a transient failure rolls everything back and the redelivery applies it once", async () => {
    const u = await createTestUser();
    const event = packCheckout(u.id);
    ledgerFault.failNext = true;
    await expect(applyPaymentEvent("mock", event)).rejects.toThrow("connection reset");
    expect(await readPayments(u.id)).toHaveLength(0);
    expect(await readUser(u.id)).toMatchObject({ credits: 0, hasPaid: false });
    expect(await readWebhookEvent(event.eventId)).toMatchObject({ processedAt: null, error: "connection reset" });

    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "processed" });
    expect((await readUser(u.id)).credits).toBe(500);
    expect(await receipts(u.email)).toHaveLength(1);
  });

  it("treats an in-flight claim as a duplicate, but re-claims one that went stale", async () => {
    const u = await createTestUser();
    const event = packCheckout(u.id);
    await db.insert(webhookEvents).values({ source: "payment:mock", eventId: event.eventId, type: event.type });
    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "duplicate" });

    await db
      .update(webhookEvents)
      .set({ receivedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(webhookEvents.eventId, event.eventId));
    expect(await applyPaymentEvent("mock", event)).toEqual({ status: "processed" });
    expect((await readUser(u.id)).credits).toBe(500);
  });

  it("events for a deleted account are recorded and acknowledged", async () => {
    const event = packCheckout("usr_gone");
    expect(await applyPaymentEvent("mock", event)).toMatchObject({ status: "processed", note: expect.stringContaining("not found") });
  });
});
