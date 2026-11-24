/** Regression tests for the payments review (docs/reviews/payments.md), ported from its probes. */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { moderationEvents, subscriptions } from "@/db/schema";
import { buildMockEvent } from "@/providers/payment/mock";
import { setProviderOverrides } from "@/providers/registry";
import { applyPaymentEvent, ORPHAN_GRACE_MS, RetryablePaymentEventError } from "@/server/billing/events";
import { listEntitledSubscriptions } from "@/server/billing/service";
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
  sub,
  subscriptionCheckout,
  T0,
} from "./fixtures";

beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
});

/** Post-commit effects (provider cancellations) run after applyPaymentEvent resolves. */
const flush = () => new Promise((r) => setTimeout(r, 50));

async function disputeEvents(userId: string) {
  return db
    .select()
    .from(moderationEvents)
    .where(and(eq(moderationEvents.userId, userId), eq(moderationEvents.kind, "payment_disputed")));
}

/** Revenue as the admin reports compute it: paid rows − fully refunded originals + negative rows. */
async function revenueCents(userId: string): Promise<number> {
  return (await readPayments(userId)).reduce((sum, p) => sum + (p.status === "paid" || p.amountCents < 0 ? p.amountCents : 0), 0);
}

describe("PAY-1 chargebacks", () => {
  it("a disputed yearly subscription invoice reverses its credits, ends the plan and flags the account", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, planId: "studio", interval: "year", amountCents: 390000 }));
    expect(await readUser(u.id)).toMatchObject({ plan: "studio", hasPaid: true, credits: 24000 });
    await debitForJob({ userId: u.id, jobId: "job_1", amount: 1000 });

    const opened = buildMockEvent("payment.disputed", {
      paymentId: "in_1",
      disputeId: "dp_1",
      amountCents: 390000,
      reason: "fraudulent",
      subscriptionId: "sub_1",
      createdAt: at(3600),
    });
    expect(await applyPaymentEvent("mock", opened)).toEqual({ status: "processed" });
    // dispute.funds_withdrawn for the same dispute changes nothing more.
    await applyPaymentEvent("mock", { ...opened, eventId: "evt_funds_withdrawn" });
    await flush();

    expect(await readUser(u.id)).toMatchObject({ credits: -1000, plan: "free", hasPaid: false });
    expect(await readSubscription()).toMatchObject({ status: "canceled" });
    const reversal = (await readLedger(u.id)).filter((l) => l.reason === "purchase_reversal");
    expect(reversal).toEqual([expect.objectContaining({ delta: -24000, idempotencyKey: "dispute:mock:dp_1" })]);
    expect(await revenueCents(u.id)).toBe(0);
    const flags = await disputeEvents(u.id);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.details).toMatchObject({ phase: "opened", disputeId: "dp_1", creditsReversed: 24000, subscriptionEnded: true });
  });

  it("a won dispute restores the credits and the revenue; the ended subscription stays canceled", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.disputed", { paymentId: "cs_pack_1", disputeId: "dp_2", amountCents: 3900 }));
    expect(await readUser(u.id)).toMatchObject({ credits: 0, hasPaid: false });

    const won = buildMockEvent("payment.dispute_closed", { paymentId: "cs_pack_1", disputeId: "dp_2", won: true, status: "won" });
    await applyPaymentEvent("mock", won);
    await applyPaymentEvent("mock", { ...won, eventId: "evt_again" });
    expect(await readUser(u.id)).toMatchObject({ credits: 500, hasPaid: true });
    expect(await revenueCents(u.id)).toBe(3900);
    expect((await disputeEvents(u.id)).map((e) => e.details.phase).sort()).toEqual(["closed", "closed", "opened"]);

    // A later refund still reverses the credits once (won re-grant nets out the dispute reversal).
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 3900, fullyRefunded: true }));
    expect((await readUser(u.id)).credits).toBe(0);
  });

  it("a lost dispute keeps the payment frozen, even when dispute.created never arrived", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.dispute_closed", { paymentId: "cs_pack_1", disputeId: "dp_3", won: false, status: "lost" }));
    expect(await readUser(u.id)).toMatchObject({ credits: 0, hasPaid: false });
    expect(await revenueCents(u.id)).toBe(0);
    expect(await disputeEvents(u.id)).toHaveLength(2);
  });

  it("a dispute after a partial refund only freezes what is left", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 1950, fullyRefunded: false }));
    await applyPaymentEvent("mock", buildMockEvent("payment.disputed", { paymentId: "cs_pack_1", disputeId: "dp_4", amountCents: 3900 }));
    expect((await readUser(u.id)).credits).toBe(0);
    expect(await revenueCents(u.id)).toBe(0);

    await applyPaymentEvent("mock", buildMockEvent("payment.dispute_closed", { paymentId: "cs_pack_1", disputeId: "dp_4", won: true, status: "won" }));
    expect((await readUser(u.id)).credits).toBe(250);
    expect(await revenueCents(u.id)).toBe(1950);
  });
});

describe("PAY-3 a stale checkout.completed never cancels a newer subscription", () => {
  it("late delivery of the old subscription's checkout keeps the new one", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, subscriptionId: "sub_A", invoiceId: "in_A", planId: "starter" }));
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, subscriptionId: "sub_B", invoiceId: "in_B", createdAt: at(120) }));
    await applyPaymentEvent("mock", subscriptionCheckout(u.id, { subscriptionId: "sub_B", checkoutId: "cs_B", createdAt: at(120) }));
    await flush();
    expect(await readSubscription("sub_A")).toMatchObject({ status: "canceled" });

    await applyPaymentEvent("mock", subscriptionCheckout(u.id, { subscriptionId: "sub_A", checkoutId: "cs_A", planId: "starter", createdAt: T0 }));
    await flush();
    expect(await readSubscription("sub_B")).toMatchObject({ status: "active" });
    expect((await readUser(u.id)).plan).toBe("pro");
  });

  it("even when the old subscription is still active (its cancellation failed)", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, subscriptionId: "sub_A", invoiceId: "in_A", planId: "starter" }));
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, subscriptionId: "sub_B", invoiceId: "in_B", createdAt: at(120) }));
    // Out-of-order: the older checkout (A) is delivered after B became active.
    await applyPaymentEvent("mock", subscriptionCheckout(u.id, { subscriptionId: "sub_A", checkoutId: "cs_A", planId: "starter", createdAt: T0 }));
    await flush();
    expect(await readSubscription("sub_A")).toMatchObject({ status: "active" });
    expect(await readSubscription("sub_B")).toMatchObject({ status: "active" });
    expect((await readUser(u.id)).plan).toBe("pro");
  });
});

describe("PAY-9 refunds end what they paid for", () => {
  it("a full refund of the only subscription invoice cancels the plan and clears hasPaid", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id }));
    await applyPaymentEvent(
      "mock",
      buildMockEvent("payment.refunded", { paymentId: "in_1", amountRefundedCents: 3900, fullyRefunded: true, subscriptionId: "sub_1", createdAt: at(60) }),
    );
    await flush();
    expect(await readUser(u.id)).toMatchObject({ plan: "free", hasPaid: false, credits: 0 });
    expect(await readSubscription()).toMatchObject({ status: "canceled" });
  });

  it("partial refunds keep the plan; refunding everything through partials clears hasPaid", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 1000, fullyRefunded: false }));
    expect((await readUser(u.id)).hasPaid).toBe(true);
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 3900, fullyRefunded: true }));
    expect((await readUser(u.id)).hasPaid).toBe(false);
  });

  it("another standing payment keeps hasPaid", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", packCheckout(u.id));
    await applyPaymentEvent("mock", packCheckout(u.id, { checkoutId: "cs_pack_2", eventId: "evt_pack_2" }));
    await applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_pack_1", amountRefundedCents: 3900, fullyRefunded: true }));
    expect(await readUser(u.id)).toMatchObject({ hasPaid: true, credits: 500 });
  });
});

describe("PAY-10 checkout events never replace the account's billing customer", () => {
  it("keeps the stored stripeCustomerId", async () => {
    const victim = await createTestUser({ stripeCustomerId: "cus_victim" });
    await applyPaymentEvent(
      "mock",
      buildMockEvent("checkout.completed", {
        userId: victim.id,
        customerId: "cus_attacker",
        mode: "subscription",
        checkoutId: "cs_pl",
        amountCents: 100,
        currency: "usd",
        createdAt: T0,
      }),
    );
    expect((await readUser(victim.id)).stripeCustomerId).toBe("cus_victim");
  });
});

describe("PAY-11 zero-total invoices", () => {
  it("a trial / 100%-off invoice starts the plan but grants no credits and no hasPaid", async () => {
    const u = await createTestUser();
    await applyPaymentEvent("mock", invoicePaid({ userId: u.id, amountCents: 0, planId: "studio", interval: "year" }));
    expect(await readUser(u.id)).toMatchObject({ plan: "studio", credits: 0, hasPaid: false });

    // An invoice paid from the customer's balance (amount_paid 0, total > 0) still grants.
    await applyPaymentEvent(
      "mock",
      invoicePaid({
        userId: u.id,
        invoiceId: "in_2",
        planId: "studio",
        interval: "year",
        billingReason: "subscription_cycle",
        amountCents: 0,
        totalCents: 390000,
        createdAt: at(60),
      }),
    );
    expect((await readUser(u.id)).credits).toBe(24000);
  });
});

describe("PAY-12 orphan events stop being retried", () => {
  const old = () => new Date(Date.now() - ORPHAN_GRACE_MS - 60_000);

  it("a refund for an unknown payment is retried within the grace period, then acknowledged", async () => {
    await expect(
      applyPaymentEvent("mock", buildMockEvent("payment.refunded", { paymentId: "cs_gone", amountRefundedCents: 100, fullyRefunded: true })),
    ).rejects.toBeInstanceOf(RetryablePaymentEventError);
    expect(
      await applyPaymentEvent(
        "mock",
        buildMockEvent("payment.refunded", { paymentId: "cs_gone", amountRefundedCents: 100, fullyRefunded: true, createdAt: old() }),
      ),
    ).toMatchObject({ status: "processed", note: expect.stringContaining("giving up") });
  });

  it("a foreign invoice (unknown customer, no app metadata) is acknowledged after the grace period", async () => {
    const foreign = invoicePaid({ customerId: "cus_other_product", subscriptionId: "sub_foreign", invoiceId: "in_f", planId: undefined, createdAt: old() });
    expect(await applyPaymentEvent("mock", foreign)).toMatchObject({ status: "processed", note: expect.stringContaining("giving up") });
  });

  it("an invoice for a deleted account is acknowledged right away", async () => {
    const r = await applyPaymentEvent("mock", invoicePaid({ userId: "usr_deleted", createdAt: new Date() }));
    expect(r).toMatchObject({ status: "processed", note: expect.stringContaining("not found") });
  });
});

describe("PAY-4 (billing side) leftover subscriptions of another provider", () => {
  it("don't entitle anyone", async () => {
    const u = await createTestUser();
    await db.insert(subscriptions).values({
      userId: u.id,
      provider: "stripe",
      providerSubscriptionId: "sub_other_provider",
      planId: "studio",
      interval: "month",
      status: "active",
      lastEventAt: T0,
    });
    await applyPaymentEvent("mock", buildMockEvent("subscription.updated", { createdAt: T0, subscription: sub(u.id, { planId: "starter" }) }));
    expect((await readUser(u.id)).plan).toBe("starter");
    expect((await listEntitledSubscriptions(u.id)).map((s) => s.providerSubscriptionId)).toEqual(["sub_1"]);
  });
});
