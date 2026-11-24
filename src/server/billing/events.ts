/**
 * Apply normalized payment events (`PaymentEvent`) to the database.
 *
 * Guarantees:
 *  - Idempotent: every event is claimed in `webhook_events` (source `payment:<provider>`, eventId)
 *    before it is applied; a processed event is a duplicate. Effects + "processed" mark commit in
 *    one transaction, so a failure leaves nothing half-applied.
 *  - Retry-safe: a failure is recorded in `webhook_events.error` and rethrown (→ HTTP 500); the
 *    provider's redelivery re-claims the row and applies it. `RetryablePaymentEventError` marks
 *    "not yet" situations (e.g. invoice.paid before we can tell whose subscription it is).
 *  - Out-of-order safe: subscription state only changes when event.createdAt ≥ lastEventAt;
 *    "canceled" is terminal and "incomplete" never overwrites a later state.
 *  - Credits: one ledger entry per checkout (`payment:<checkoutId>`) / invoice (`invoice:<id>`);
 *    refunds remove a prorated share of what that payment granted (balance may go negative).
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { creditLedger, payments, subscriptions, user, webhookEvents } from "@/db/schema";
import type { PaymentRow, SubscriptionRow } from "@/db/types";
import { env } from "@/lib/env";
import type { PaymentEvent } from "@/providers/types";
import { applyCredit } from "@/server/credits/ledger";
import { sendEmailSafe } from "@/server/email";
import { AppError } from "@/server/http";
import type { PaymentKind, PaymentProviderName, PlanId, SubscriptionStatus } from "@/types/domain";
import { getCreditPack } from "@/config/plans";
import {
  addBillingInterval,
  formatMoney,
  isPaidPlanId,
  planDescription,
  planGrantCredits,
  planRank,
  type BillingInterval,
  type PaidPlanId,
} from "./catalog";

/** The event can't be applied yet (missing user/subscription/payment); the provider should redeliver it. */
export class RetryablePaymentEventError extends AppError {
  constructor(message: string) {
    super("internal", message);
    this.name = "RetryablePaymentEventError";
  }
}

export type ApplyPaymentEventStatus = "processed" | "duplicate" | "ignored";
export interface ApplyPaymentEventResult {
  status: ApplyPaymentEventStatus;
  /** Set when the event was processed but had no effect (e.g. stale or for a deleted account). */
  note?: string;
}

/** Statuses that keep plan benefits. past_due keeps the plan while the provider retries the charge. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing", "past_due"];
/** Invoices that start a paid period and therefore grant the plan's credits. */
const CREDIT_GRANTING_REASONS = new Set(["subscription_create", "subscription_cycle", "subscription"]);
/** A claimed-but-unfinished event older than this is assumed crashed and may be re-claimed. */
const STALE_CLAIM = sql`interval '5 minutes'`;
const MAX_ERROR_LENGTH = 500;

type AfterCommit = () => Promise<unknown>;
interface Ctx {
  tx: Tx;
  provider: PaymentProviderName;
  /** Side effects that must only happen once the transaction committed (emails, provider calls). */
  after: AfterCommit[];
}
type Outcome = void | { note: string };

const sourceOf = (provider: PaymentProviderName) => `payment:${provider}`;

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);
}

/**
 * Apply one payment event exactly once. Returns "duplicate" for an event that was already
 * processed (or is being processed right now by another request).
 */
export async function applyPaymentEvent(
  provider: PaymentProviderName,
  event: PaymentEvent,
): Promise<ApplyPaymentEventResult> {
  if (event.type === "ignored") return { status: "ignored" };
  const source = sourceOf(provider);
  const where = and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, event.eventId));

  // Claim: insert, or re-claim a row whose previous attempt failed / crashed.
  const claimed = await db
    .insert(webhookEvents)
    .values({ source, eventId: event.eventId, type: event.type, payload: event })
    .onConflictDoUpdate({
      target: [webhookEvents.source, webhookEvents.eventId],
      set: { error: null, receivedAt: sql`now()` },
      setWhere: sql`${webhookEvents.processedAt} is null and (${webhookEvents.error} is not null or ${webhookEvents.receivedAt} < now() - ${STALE_CLAIM})`,
    })
    .returning({ eventId: webhookEvents.eventId });
  if (!claimed.length) return { status: "duplicate" };

  const after: AfterCommit[] = [];
  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const result = await applyEvent({ tx, provider, after }, event);
      await tx
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: result ? result.note.slice(0, MAX_ERROR_LENGTH) : null })
        .where(where);
      return result;
    });
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: errorText(err) })
      .where(where)
      .catch(() => undefined);
    throw err;
  }

  for (const effect of after) {
    await effect().catch((err) => console.error(`[billing] post-commit effect for ${event.eventId} failed:`, err));
  }
  return outcome ? { status: "processed", note: outcome.note } : { status: "processed" };
}

function applyEvent(ctx: Ctx, event: Exclude<PaymentEvent, { type: "ignored" }>): Promise<Outcome> {
  switch (event.type) {
    case "checkout.completed":
      return event.mode === "payment" ? onCreditPackPurchase(ctx, event) : onSubscriptionCheckout(ctx, event);
    case "invoice.paid":
      return onInvoicePaid(ctx, event);
    case "invoice.payment_failed":
      return onInvoicePaymentFailed(ctx, event);
    case "subscription.updated":
      return onSubscriptionChanged(ctx, event, false);
    case "subscription.deleted":
      return onSubscriptionChanged(ctx, event, true);
    case "payment.refunded":
      return onRefund(ctx, event);
  }
}

/* ───────────────────────────── lookups ───────────────────────────── */

interface BillingUser {
  id: string;
  name: string;
  email: string;
}

const billingUserColumns = { id: user.id, name: user.name, email: user.email };

/** Resolve the account an event belongs to: explicit user id first, then the provider customer id. */
async function resolveUser(tx: Tx, refs: { userId?: string | null; customerId?: string | null }): Promise<BillingUser | null> {
  if (refs.userId) {
    const [row] = await tx.select(billingUserColumns).from(user).where(eq(user.id, refs.userId)).limit(1);
    if (row) return row;
  }
  if (refs.customerId) {
    const [row] = await tx
      .select(billingUserColumns)
      .from(user)
      .where(eq(user.stripeCustomerId, refs.customerId))
      .orderBy(desc(user.createdAt))
      .limit(1);
    if (row) return row;
  }
  return null;
}

async function findSubscription(ctx: Ctx, subscriptionId: string): Promise<SubscriptionRow | undefined> {
  const [row] = await ctx.tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, ctx.provider), eq(subscriptions.providerSubscriptionId, subscriptionId)))
    .for("update");
  return row;
}

/** Remember the provider customer (needed for the billing portal and customer-only events). */
async function saveCustomer(ctx: Ctx, userId: string, customerId: string | null | undefined, paid = false): Promise<void> {
  const set: Partial<typeof user.$inferInsert> = {};
  if (customerId) set.stripeCustomerId = customerId;
  if (paid) set.hasPaid = true;
  if (Object.keys(set).length) await ctx.tx.update(user).set(set).where(eq(user.id, userId));
}

/** user.plan = best plan among the user's entitled subscriptions, else "free". */
async function recomputeUserPlan(ctx: Ctx, userId: string): Promise<PlanId> {
  const rows = await ctx.tx
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ENTITLED_STATUSES])));
  const plan = rows
    .map((r) => r.planId)
    .filter(isPaidPlanId)
    .reduce<PlanId>((best, p) => (planRank(p) > planRank(best) ? p : best), "free");
  await ctx.tx.update(user).set({ plan }).where(eq(user.id, userId));
  return plan;
}

/* ───────────────────────────── payments + credits ───────────────────────────── */

interface PaymentInput {
  userId: string;
  providerPaymentId: string;
  kind: PaymentKind;
  productId: string;
  amountCents: number;
  currency: string;
  credits: number;
}

async function recordPayment(ctx: Ctx, input: PaymentInput): Promise<{ row: PaymentRow; created: boolean }> {
  const [created] = await ctx.tx
    .insert(payments)
    .values({ ...input, provider: ctx.provider, currency: input.currency.toLowerCase(), status: "paid" })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning();
  if (created) return { row: created, created: true };
  const [existing] = await ctx.tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, ctx.provider), eq(payments.providerPaymentId, input.providerPaymentId)))
    .limit(1);
  if (!existing) throw new Error(`Payment ${input.providerPaymentId} vanished while recording it`);
  return { row: existing, created: false };
}

function queueReceipt(
  ctx: Ctx,
  to: BillingUser,
  receipt: { description: string; amountCents: number; currency: string; credits: number },
): void {
  ctx.after.push(() =>
    sendEmailSafe(
      "receipt",
      to.email,
      {
        name: to.name || "there",
        description: receipt.description,
        amount: formatMoney(receipt.amountCents, receipt.currency),
        credits: receipt.credits,
        url: `${env.NEXT_PUBLIC_APP_URL}/app/billing`,
      },
      { userId: to.id },
    ),
  );
}

/* ───────────────────────────── handlers ───────────────────────────── */

type EventOf<T extends PaymentEvent["type"]> = Extract<PaymentEvent, { type: T }>;

async function onCreditPackPurchase(ctx: Ctx, e: EventOf<"checkout.completed">): Promise<Outcome> {
  const pack = e.creditPackId ? getCreditPack(e.creditPackId) : undefined;
  // Money was taken for something we can't map: fail loudly (recorded + redelivered) so an operator can fix config.
  if (!pack) throw new Error(`Checkout ${e.checkoutId} is for an unknown credit pack "${e.creditPackId ?? ""}"`);
  const buyer = await resolveUser(ctx.tx, { userId: e.userId });
  if (!buyer) return { note: `user ${e.userId} not found (deleted account?)` };

  const payment = await recordPayment(ctx, {
    userId: buyer.id,
    providerPaymentId: e.checkoutId,
    kind: "credit_pack",
    productId: pack.id,
    amountCents: e.amountCents,
    currency: e.currency,
    credits: pack.credits,
  });
  await applyCredit(
    {
      userId: buyer.id,
      delta: pack.credits,
      reason: "purchase",
      idempotencyKey: `payment:${e.checkoutId}`,
      paymentId: payment.row.id,
      note: `${pack.name} credit pack`,
    },
    ctx.tx,
  );
  await saveCustomer(ctx, buyer.id, e.customerId, true);
  if (payment.created) {
    queueReceipt(ctx, buyer, {
      description: `${pack.name} credit pack`,
      amountCents: e.amountCents,
      currency: e.currency,
      credits: pack.credits,
    });
  }
}

/**
 * Create the subscription row from a payment-side event (checkout / invoice) when the
 * subscription events haven't arrived yet, or promote a not-yet-paid row to active.
 */
async function upsertPaidSubscription(
  ctx: Ctx,
  args: {
    userId: string;
    subscriptionId: string;
    customerId: string | null;
    planId: PaidPlanId;
    interval: BillingInterval;
    createdAt: Date;
  },
): Promise<void> {
  const existing = await findSubscription(ctx, args.subscriptionId);
  if (!existing) {
    await ctx.tx
      .insert(subscriptions)
      .values({
        userId: args.userId,
        provider: ctx.provider,
        providerSubscriptionId: args.subscriptionId,
        providerCustomerId: args.customerId,
        planId: args.planId,
        interval: args.interval,
        status: "active",
        // Best estimate until the provider's subscription event reports the real period.
        currentPeriodEnd: addBillingInterval(args.createdAt, args.interval),
        cancelAtPeriodEnd: false,
        lastEventAt: args.createdAt,
      })
      .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.providerSubscriptionId] });
    return;
  }
  const promotable: SubscriptionStatus[] = ["incomplete", "past_due", "unpaid"];
  if (promotable.includes(existing.status) && args.createdAt >= existing.lastEventAt) {
    await ctx.tx
      .update(subscriptions)
      .set({ status: "active", lastEventAt: args.createdAt })
      .where(eq(subscriptions.id, existing.id));
  }
}

async function onSubscriptionCheckout(ctx: Ctx, e: EventOf<"checkout.completed">): Promise<Outcome> {
  const buyer = await resolveUser(ctx.tx, { userId: e.userId });
  if (!buyer) return { note: `user ${e.userId} not found (deleted account?)` };
  await saveCustomer(ctx, buyer.id, e.customerId);
  if (!e.subscriptionId || !e.planId || !e.interval) return { note: "subscription details missing; awaiting subscription events" };

  await upsertPaidSubscription(ctx, {
    userId: buyer.id,
    subscriptionId: e.subscriptionId,
    customerId: e.customerId,
    planId: e.planId,
    interval: e.interval,
    createdAt: e.createdAt,
  });
  await recomputeUserPlan(ctx, buyer.id);

  // Switching plans = a new subscription; end the previous one so the user isn't billed twice.
  const keep = e.subscriptionId;
  const provider = ctx.provider;
  ctx.after.push(() => cancelSupersededSubscriptions(provider, buyer.id, keep));
}

async function cancelSupersededSubscriptions(provider: PaymentProviderName, userId: string, keepSubscriptionId: string) {
  const others = await db
    .select({ id: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.provider, provider),
        ne(subscriptions.providerSubscriptionId, keepSubscriptionId),
        inArray(subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    );
  if (!others.length) return;
  const { getPaymentProvider } = await import("@/providers/registry");
  const payment = getPaymentProvider();
  if (payment.name !== provider) return;
  for (const { id } of others) await payment.cancelSubscription(id);
}

async function onInvoicePaid(ctx: Ctx, e: EventOf<"invoice.paid">): Promise<Outcome> {
  const sub = await findSubscription(ctx, e.subscriptionId);
  const payer = await resolveUser(ctx.tx, { userId: e.userId ?? sub?.userId, customerId: e.customerId });
  if (!payer) throw new RetryablePaymentEventError(`invoice ${e.invoiceId}: account not known yet`);
  const planId = e.planId ?? (sub && isPaidPlanId(sub.planId) ? sub.planId : undefined);
  if (!planId) throw new RetryablePaymentEventError(`invoice ${e.invoiceId}: plan not known yet`);
  const interval: BillingInterval = e.interval ?? sub?.interval ?? "month";

  const credits = CREDIT_GRANTING_REASONS.has(e.billingReason) ? planGrantCredits(planId, interval) : 0;
  const description = planDescription(planId, interval);
  const payment = await recordPayment(ctx, {
    userId: payer.id,
    providerPaymentId: e.invoiceId,
    kind: "subscription",
    productId: `${planId}_${interval}`,
    amountCents: e.amountCents,
    currency: e.currency,
    credits,
  });
  if (credits > 0) {
    await applyCredit(
      {
        userId: payer.id,
        delta: credits,
        reason: "subscription_grant",
        idempotencyKey: `invoice:${e.invoiceId}`,
        paymentId: payment.row.id,
        note: description,
      },
      ctx.tx,
    );
  }
  await saveCustomer(ctx, payer.id, e.customerId, true);
  await upsertPaidSubscription(ctx, {
    userId: payer.id,
    subscriptionId: e.subscriptionId,
    customerId: e.customerId,
    planId,
    interval,
    createdAt: e.createdAt,
  });
  await recomputeUserPlan(ctx, payer.id);
  if (payment.created) {
    queueReceipt(ctx, payer, { description, amountCents: e.amountCents, currency: e.currency, credits });
  }
}

async function onInvoicePaymentFailed(ctx: Ctx, e: EventOf<"invoice.payment_failed">): Promise<Outcome> {
  const sub = await findSubscription(ctx, e.subscriptionId);
  // Unknown subscription: its own subscription events will carry the state.
  if (!sub) return { note: "subscription not known yet" };
  if (e.createdAt < sub.lastEventAt) return { note: "stale event" };
  if (sub.status !== "active" && sub.status !== "trialing") return;
  await ctx.tx
    .update(subscriptions)
    .set({ status: "past_due", lastEventAt: e.createdAt })
    .where(eq(subscriptions.id, sub.id));
  await recomputeUserPlan(ctx, sub.userId);
}

async function onSubscriptionChanged(
  ctx: Ctx,
  e: EventOf<"subscription.updated" | "subscription.deleted">,
  deleted: boolean,
): Promise<Outcome> {
  const s = e.subscription;
  const incoming: SubscriptionStatus = deleted ? "canceled" : s.status;
  const existing = await findSubscription(ctx, s.subscriptionId);

  if (existing) {
    if (!deleted) {
      if (e.createdAt < existing.lastEventAt) return { note: "stale event" };
      // Canceled is terminal at every provider; nothing revives it.
      if (existing.status === "canceled") return { note: "subscription already canceled" };
    }
    // "incomplete" only precedes the first payment; never let a late one overwrite a paid state.
    const status = incoming === "incomplete" && existing.status !== "incomplete" ? existing.status : incoming;
    await ctx.tx
      .update(subscriptions)
      .set({
        planId: s.planId,
        interval: s.interval,
        status,
        currentPeriodEnd: s.currentPeriodEnd ?? existing.currentPeriodEnd,
        cancelAtPeriodEnd: deleted ? false : s.cancelAtPeriodEnd,
        providerCustomerId: s.customerId || existing.providerCustomerId,
        lastEventAt: e.createdAt > existing.lastEventAt ? e.createdAt : existing.lastEventAt,
      })
      .where(eq(subscriptions.id, existing.id));
    await recomputeUserPlan(ctx, existing.userId);
    return;
  }

  const owner = await resolveUser(ctx.tx, { userId: s.userId, customerId: s.customerId });
  if (!owner) {
    if (deleted) return { note: "deleted subscription for an unknown account" };
    throw new RetryablePaymentEventError(`subscription ${s.subscriptionId}: account not known yet`);
  }
  await ctx.tx
    .insert(subscriptions)
    .values({
      userId: owner.id,
      provider: ctx.provider,
      providerSubscriptionId: s.subscriptionId,
      providerCustomerId: s.customerId,
      planId: s.planId,
      interval: s.interval,
      status: incoming,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: deleted ? false : s.cancelAtPeriodEnd,
      lastEventAt: e.createdAt,
    })
    .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.providerSubscriptionId] });
  await saveCustomer(ctx, owner.id, s.customerId);
  await recomputeUserPlan(ctx, owner.id);
}

async function onRefund(ctx: Ctx, e: EventOf<"payment.refunded">): Promise<Outcome> {
  const [payment] = await ctx.tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, ctx.provider), eq(payments.providerPaymentId, e.paymentId)))
    .for("update");
  if (!payment) throw new RetryablePaymentEventError(`refund for unknown payment ${e.paymentId}`);

  // `amountRefundedCents` is the cumulative refunded amount; reverse the matching share of credits.
  const share =
    e.fullyRefunded || payment.amountCents <= 0
      ? payment.credits
      : Math.min(payment.credits, Math.round((payment.credits * e.amountRefundedCents) / payment.amountCents));
  const [{ reversed }] = await ctx.tx
    .select({ reversed: sql<number>`coalesce(-sum(${creditLedger.delta}), 0)`.mapWith(Number) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, payment.userId),
        eq(creditLedger.paymentId, payment.id),
        eq(creditLedger.reason, "purchase_reversal"),
      ),
    );
  const toReverse = share - reversed;
  if (toReverse > 0) {
    await applyCredit(
      {
        userId: payment.userId,
        delta: -toReverse,
        reason: "purchase_reversal",
        idempotencyKey: `refund:${ctx.provider}:${e.eventId}`,
        paymentId: payment.id,
        note: e.fullyRefunded ? "Payment refunded" : "Payment partially refunded",
      },
      ctx.tx,
    );
  }
  if (e.fullyRefunded && payment.status !== "refunded") {
    await ctx.tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
  }
}
