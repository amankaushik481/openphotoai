/**
 * Real-Postgres concurrency tests for payment events (PGlite can't reproduce lock ordering).
 * Run with TEST_POSTGRES_URL=postgres://… (a disposable server; this file uses its own database).
 *
 * Stripe sends checkout.session.completed, customer.subscription.created and invoice.paid for a new
 * subscription within the same second, so they are routinely applied concurrently.
 */
import { describe, expect, it } from "vitest";
import { buildMockEvent } from "@/providers/payment/mock";
import { applyPaymentEvent } from "@/server/billing/events";
import { planGrantCredits } from "@/server/billing/catalog";
import { createTestUser } from "../../helpers/db";
import { setupPostgres } from "../../helpers/postgres";
import type { NormalizedSubscription } from "@/providers/types";
import { readSubscription, readUser, sub } from "./fixtures";

const pg = setupPostgres("billing");

/** The driver's message (drizzle wraps it as `cause`): "deadlock detected", ... */
function rootMessage(err: unknown): string {
  let e = err;
  while (e instanceof Error && e.cause) e = e.cause;
  return e instanceof Error ? e.message : String(e);
}

function newSubscriptionEvents(userId: string, n: number, subscription: Partial<NormalizedSubscription> = {}) {
  const subscriptionId = `sub_pg_${n}`;
  const createdAt = new Date(Date.now() - 1000);
  return [
    buildMockEvent("checkout.completed", {
      userId,
      customerId: `cus_pg_${n}`,
      mode: "subscription",
      checkoutId: `cs_pg_${n}`,
      planId: "pro",
      interval: "month",
      subscriptionId,
      amountCents: 3900,
      currency: "usd",
      createdAt,
    }),
    buildMockEvent("subscription.updated", {
      subscription: sub(userId, { subscriptionId, customerId: `cus_pg_${n}`, ...subscription }),
      createdAt,
    }),
    buildMockEvent("invoice.paid", {
      invoiceId: `in_pg_${n}`,
      subscriptionId,
      customerId: `cus_pg_${n}`,
      userId,
      amountCents: 3900,
      currency: "usd",
      billingReason: "subscription_create",
      planId: "pro",
      interval: "month",
      createdAt,
    }),
  ];
}

describe.skipIf(!pg.enabled)("payment events on real Postgres", () => {
  it("applies a new subscription's checkout, subscription and invoice events concurrently without deadlocks", async () => {
    const failures: string[] = [];
    for (let n = 0; n < 15; n++) {
      const u = await createTestUser({ credits: 0 });
      const events = newSubscriptionEvents(u.id, n);
      const results = await Promise.allSettled(events.map((e) => applyPaymentEvent("mock", e)));
      for (const r of results) if (r.status === "rejected") failures.push(rootMessage(r.reason));
      // Whatever lost a race is redelivered by the provider: the end state must still be exact.
      for (const [i, r] of results.entries()) if (r.status === "rejected") await applyPaymentEvent("mock", events[i]!);
      const after = await readUser(u.id);
      expect(after.plan).toBe("pro");
      expect(after.credits).toBe(planGrantCredits("pro", "month"));
      expect((await readSubscription(`sub_pg_${n}`))?.status).toBe("active");
    }
    expect(failures).toEqual([]);
  });

  it("applies several credit-pack purchases of one account concurrently without deadlocks", async () => {
    // Each purchase inserts a payment (FK: KEY SHARE on the user row) and then grants credits (FOR UPDATE).
    const failures: string[] = [];
    for (let round = 0; round < 5; round++) {
      const u = await createTestUser({ credits: 0 });
      const events = Array.from({ length: 4 }, (_, i) =>
        buildMockEvent("checkout.completed", {
          userId: u.id,
          customerId: `cus_pack_${round}`,
          mode: "payment",
          checkoutId: `cs_pack_${u.id}_${i}`,
          creditPackId: "credits_500",
          amountCents: 3900,
          currency: "usd",
        }),
      );
      const results = await Promise.allSettled(events.map((e) => applyPaymentEvent("mock", e)));
      for (const r of results) if (r.status === "rejected") failures.push(rootMessage(r.reason));
      for (const [i, r] of results.entries()) if (r.status === "rejected") await applyPaymentEvent("mock", events[i]!);
      expect((await readUser(u.id)).credits).toBe(2000);
    }
    expect(failures).toEqual([]);
  });

  it("never drops a subscription event that loses the insert race to the checkout or invoice", async () => {
    // Without re-applying on conflict, a concurrent subscription.updated (here: cancel at period end)
    // that found no row and lost the insert was silently discarded, and an invoice.paid that lost
    // it to an `incomplete` row never promoted it (plan stayed free).
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    periodEnd.setMilliseconds(0);
    for (let n = 100; n < 110; n++) {
      const u = await createTestUser({ credits: 0 });
      const events = newSubscriptionEvents(u.id, n, { cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd });
      const results = await Promise.allSettled(events.map((e) => applyPaymentEvent("mock", e)));
      expect(results.map((r) => (r.status === "rejected" ? rootMessage(r.reason) : "ok"))).toEqual(["ok", "ok", "ok"]);
      const row = await readSubscription(`sub_pg_${n}`);
      expect(row).toMatchObject({ status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd });
    }
    for (let n = 200; n < 210; n++) {
      const u = await createTestUser({ credits: 0 });
      const events = newSubscriptionEvents(u.id, n, { status: "incomplete" });
      const results = await Promise.allSettled(events.map((e) => applyPaymentEvent("mock", e)));
      expect(results.map((r) => (r.status === "rejected" ? rootMessage(r.reason) : "ok"))).toEqual(["ok", "ok", "ok"]);
      expect((await readSubscription(`sub_pg_${n}`))?.status).toBe("active");
      expect((await readUser(u.id)).plan).toBe("pro");
    }
  });
});
