/**
 * Apply normalized payment events (`PaymentEvent`) to the database.
 *
 * Guarantees:
 *  - Idempotent: every event is claimed in `webhook_events` (source `payment:<provider>`, eventId)
 *    before it is applied; a processed event is a duplicate. Effects + "processed" mark commit in
 *    one transaction, so a failure leaves nothing half-applied. A delivery of an event another
 *    request has claimed but not finished is "in_progress" (→ HTTP 409, the provider redelivers);
 *    a claim older than STALE_CLAIM is assumed crashed and taken over.
 *  - Retry-safe: a failure is recorded in `webhook_events.error` and rethrown (→ HTTP 500); the
 *    provider's redelivery re-claims the row and applies it. `RetryablePaymentEventError` marks
 *    "not yet" situations (e.g. invoice.paid before we can tell whose subscription it is).
 *  - Out-of-order safe: subscription state only changes when event.createdAt ≥ lastEventAt;
 *    "canceled" is terminal and "incomplete" never overwrites a later state.
 *  - Credits: one ledger entry per checkout (`payment:<checkoutId>`) / invoice (`invoice:<id>`);
 *    refunds remove a prorated share of what that payment granted (balance may go negative).
 *    Invoices with a zero total (trials, 100% coupons) grant no credits.
 *  - Refunds + chargebacks: a full refund or a dispute of a subscription invoice ends that
 *    subscription; `hasPaid` is recomputed from the payments still standing. A dispute reverses
 *    every credit the payment granted, records a negative `<paymentId>:dispute:<disputeId>`
 *    payment row and flags the account (`payment_disputed` moderation event); a dispute we win
 *    restores the credits and removes the row.
 *  - Orphans: events for deleted accounts or for payments that aren't ours are acknowledged with a
 *    note; "not known yet" cases are retried for ORPHAN_GRACE_MS, then acknowledged.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { creditLedger, moderationEvents, payments, subscriptions, user, webhookEvents } from "@/db/schema";
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

/**
 * `duplicate`: already processed. `in_progress`: another request holds a fresh claim on it and hasn't
 * finished; the caller must answer with a retryable status so the provider redelivers it.
 */
export type ApplyPaymentEventStatus = "processed" | "duplicate" | "in_progress" | "ignored";
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
/**
 * How long an event that can't be matched yet (unknown payment / account / plan) is retried before
 * it is acknowledged with a note: Stripe would otherwise retry foreign or orphaned events for days.
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
/** `payments.providerPaymentId` of a chargeback row: `<original id>:dispute:<disputeId>`. */
const DISPUTE_ROW = ":dispute:";

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
 * processed and "in_progress" for one another request is processing right now.
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
  if (!claimed.length) {
    // Only a finished event is a duplicate. A fresh claim may still fail or die mid-way: answering
    // 2xx would make the provider stop redelivering, losing the event for good.
    const [row] = await db.select({ processedAt: webhookEvents.processedAt }).from(webhookEvents).where(where).limit(1);
    return row?.processedAt ? { status: "duplicate" } : { status: "in_progress" };
  }

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
    case "payment.disputed":
      return onDisputeOpened(ctx, event);
    case "payment.dispute_closed":
      return onDisputeClosed(ctx, event);
  }
}

/**
 * An event we can't match to our data. Within ORPHAN_GRACE_MS it may just be early (the event that
 * creates the payment / account link hasn't been applied yet): retry. Later it never will be
 * (deleted account, another product's payment): acknowledge with a note so the provider stops.
 */
function orphan(e: { createdAt: Date }, note: string): Outcome {
  if (Date.now() - e.createdAt.getTime() < ORPHAN_GRACE_MS) throw new RetryablePaymentEventError(note);
  return { note: `${note}; giving up` };
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

/**
 * Remember the provider customer (needed for the billing portal and customer-only events). An
 * existing, different customer is never replaced from an event: the portal and later checkouts
 * must keep using the account's own customer.
 */
async function saveCustomer(ctx: Ctx, userId: string, customerId: string | null | undefined, paid = false): Promise<void> {
  if (!customerId && !paid) return;
  await ctx.tx
    .update(user)
    .set({
      ...(customerId ? { stripeCustomerId: sql`coalesce(${user.stripeCustomerId}, ${customerId})` } : {}),
      ...(paid ? { hasPaid: true } : {}),
    })
    .where(eq(user.id, userId));
}

/**
 * user.hasPaid = some payment still holds money: status "paid", amount > 0, and its partial-refund
 * and chargeback rows (`<id>:refund:…` / `<id>:dispute:…`, negative amounts) don't cancel it out.
 */
async function recomputeHasPaid(ctx: Ctx, userId: string): Promise<boolean> {
  const rows = await ctx.tx
    .select({ id: payments.providerPaymentId, provider: payments.provider, status: payments.status, amountCents: payments.amountCents })
    .from(payments)
    .where(eq(payments.userId, userId));
  const adjustment = /^(.+?):(?:refund|dispute):/;
  const net = new Map<string, number>();
  for (const r of rows) {
    const original = adjustment.exec(r.id)?.[1];
    if (original === undefined && (r.status !== "paid" || r.amountCents <= 0)) continue;
    const key = `${r.provider}:${original ?? r.id}`;
    net.set(key, (net.get(key) ?? 0) + r.amountCents);
  }
  // Adjustment rows of an original that doesn't count (fully refunded) only ever subtract.
  const hasPaid = [...net.values()].some((cents) => cents > 0);
  await ctx.tx.update(user).set({ hasPaid }).where(eq(user.id, userId));
  return hasPaid;
}

/** user.plan = best plan among the user's entitled subscriptions (at the configured provider), else "free". */
async function recomputeUserPlan(ctx: Ctx, userId: string): Promise<PlanId> {
  // Lock the user first so concurrent events for two of their subscriptions can't each store a plan
  // computed from a stale view of the other (lock order stays subscription → user).
  await ctx.tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  const rows = await ctx.tx
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.provider, ctx.provider),
        inArray(subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    );
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
  // A free (100%-off) pack is a gift, not a payment: it doesn't lift free-tier limits like watermarks.
  await saveCustomer(ctx, buyer.id, e.customerId, e.amountCents > 0);
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
  if (!e.subscriptionId || !e.planId || !e.interval) {
    await saveCustomer(ctx, buyer.id, e.customerId);
    return { note: "subscription details missing; awaiting subscription events" };
  }

  // Lock order everywhere: subscription row before user row (concurrent deliveries can't deadlock).
  await upsertPaidSubscription(ctx, {
    userId: buyer.id,
    subscriptionId: e.subscriptionId,
    customerId: e.customerId,
    planId: e.planId,
    interval: e.interval,
    createdAt: e.createdAt,
  });
  await saveCustomer(ctx, buyer.id, e.customerId);
  await recomputeUserPlan(ctx, buyer.id);

  // Switching plans = a new subscription; end the previous one so the user isn't billed twice.
  const superseded = await supersededSubscriptions(ctx, buyer.id, e.subscriptionId, e.createdAt);
  if (superseded.length) queueProviderCancel(ctx, superseded);
}

/**
 * The user's subscriptions a completed checkout replaces: the other entitled ones whose newest
 * provider event is older than the checkout. Nothing when the checkout's own subscription is no
 * longer entitled. So a late or retried checkout.completed (Stripe retries for days) never cancels
 * a subscription that was bought, renewed or changed after it.
 */
async function supersededSubscriptions(ctx: Ctx, userId: string, subscriptionId: string, checkoutAt: Date): Promise<string[]> {
  const rows = await ctx.tx
    .select({ id: subscriptions.providerSubscriptionId, status: subscriptions.status, lastEventAt: subscriptions.lastEventAt })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.provider, ctx.provider)));
  const own = rows.find((r) => r.id === subscriptionId);
  if (!own || !ENTITLED_STATUSES.includes(own.status)) return [];
  return rows
    .filter((r) => r.id !== subscriptionId && ENTITLED_STATUSES.includes(r.status) && r.lastEventAt < checkoutAt)
    .map((r) => r.id);
}

/** Cancel subscriptions at the provider once the transaction committed (no-op if the provider changed). */
function queueProviderCancel(ctx: Ctx, subscriptionIds: string[]): void {
  const provider = ctx.provider;
  ctx.after.push(async () => {
    const { getPaymentProvider } = await import("@/providers/registry");
    const payment = getPaymentProvider();
    if (payment.name !== provider) return;
    for (const id of subscriptionIds) await payment.cancelSubscription(id);
  });
}

/**
 * End a subscription now (full refund / chargeback of its invoice): canceled locally right away, so
 * the plan drops whatever the provider says, and at the provider after commit so it bills no more.
 * The caller must hold the payment lock only (lock order: subscription → user).
 */
async function endSubscription(ctx: Ctx, subscriptionId: string | undefined, at: Date): Promise<boolean> {
  if (!subscriptionId) return false;
  const sub = await findSubscription(ctx, subscriptionId);
  if (!sub || sub.status === "canceled") return false;
  await ctx.tx
    .update(subscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: false, lastEventAt: at > sub.lastEventAt ? at : sub.lastEventAt })
    .where(eq(subscriptions.id, sub.id));
  queueProviderCancel(ctx, [subscriptionId]);
  return true;
}

async function onInvoicePaid(ctx: Ctx, e: EventOf<"invoice.paid">): Promise<Outcome> {
  const sub = await findSubscription(ctx, e.subscriptionId);
  const payer = await resolveUser(ctx.tx, { userId: e.userId ?? sub?.userId, customerId: e.customerId });
  if (!payer) {
    // Our metadata names a user that no longer exists: the account was deleted (its subscription
    // cancellation must have failed). That can never resolve.
    if (e.userId) return { note: `invoice ${e.invoiceId}: user ${e.userId} not found (deleted account?)` };
    return orphan(e, `invoice ${e.invoiceId}: account not known`);
  }
  const planId = e.planId ?? (sub && isPaidPlanId(sub.planId) ? sub.planId : undefined);
  if (!planId) return orphan(e, `invoice ${e.invoiceId}: plan not known`);
  const interval: BillingInterval = e.interval ?? sub?.interval ?? "month";

  // Trials and 100%-off invoices (total 0) start a period without payment: plan benefits follow the
  // subscription status, but credits only come with money.
  const total = e.totalCents ?? e.amountCents;
  const credits = CREDIT_GRANTING_REASONS.has(e.billingReason) && total > 0 ? planGrantCredits(planId, interval) : 0;
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
  await saveCustomer(ctx, payer.id, e.customerId, e.amountCents > 0);
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
    if (s.userId) return { note: `subscription ${s.subscriptionId}: user ${s.userId} not found (deleted account?)` };
    return orphan(e, `subscription ${s.subscriptionId}: account not known`);
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

async function lockPayment(ctx: Ctx, providerPaymentId: string): Promise<PaymentRow | undefined> {
  const [row] = await ctx.tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, ctx.provider), eq(payments.providerPaymentId, providerPaymentId)))
    .for("update");
  return row;
}

/** Net credits taken back from a payment so far (refunds + chargebacks − chargebacks we won). */
async function reversedCredits(ctx: Ctx, payment: PaymentRow): Promise<number> {
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
  return reversed;
}

/** Cents refunded so far through partial-refund rows (`<id>:refund:<eventId>`, negative amounts). */
async function partiallyRefundedCents(ctx: Ctx, payment: PaymentRow): Promise<number> {
  const prefix = `${payment.providerPaymentId}:refund:`;
  const [{ refundedCents }] = await ctx.tx
    .select({ refundedCents: sql<number>`coalesce(-sum(${payments.amountCents}), 0)`.mapWith(Number) })
    .from(payments)
    .where(
      and(
        eq(payments.userId, payment.userId),
        eq(payments.provider, ctx.provider),
        sql`starts_with(${payments.providerPaymentId}, ${prefix})`,
      ),
    );
  return refundedCents;
}

async function onRefund(ctx: Ctx, e: EventOf<"payment.refunded">): Promise<Outcome> {
  const payment = await lockPayment(ctx, e.paymentId);
  // Unknown after the grace period: the account was deleted (payments cascade) or it isn't ours.
  if (!payment) return orphan(e, `refund for unknown payment ${e.paymentId}`);
  // A full refund of a subscription invoice gives the period's money back: the plan ends with it.
  const ended = payment.kind === "subscription" && e.fullyRefunded && (await endSubscription(ctx, e.subscriptionId, e.createdAt));

  // `amountRefundedCents` is the cumulative refunded amount; reverse the matching share of credits.
  const share =
    e.fullyRefunded || payment.amountCents <= 0
      ? payment.credits
      : Math.min(payment.credits, Math.round((payment.credits * e.amountRefundedCents) / payment.amountCents));
  const reversed = await reversedCredits(ctx, payment);
  const toReverse = Math.max(0, share - reversed);
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
  await recordRefund(ctx, payment, e, toReverse);
  if (e.fullyRefunded) await recomputeHasPaid(ctx, payment.userId);
  if (ended) await recomputeUserPlan(ctx, payment.userId);
}

/* ───────────────────────────── chargebacks ───────────────────────────── */

const disputeKey = (ctx: Ctx, disputeId: string) => `dispute:${ctx.provider}:${disputeId}`;

/** Credits a refund (not a dispute) has a claim on: all of them once fully refunded, else the refunded share. */
async function refundedCreditShare(ctx: Ctx, payment: PaymentRow): Promise<number> {
  if (payment.status === "refunded") return payment.credits;
  if (payment.amountCents <= 0) return 0;
  const cents = await partiallyRefundedCents(ctx, payment);
  return Math.min(payment.credits, Math.round((payment.credits * cents) / payment.amountCents));
}

async function flagDispute(ctx: Ctx, payment: PaymentRow, details: Record<string, unknown>): Promise<void> {
  await ctx.tx.insert(moderationEvents).values({
    userId: payment.userId,
    kind: "payment_disputed",
    details: { provider: ctx.provider, paymentId: payment.providerPaymentId, kind: payment.kind, ...details },
  });
}

/**
 * Freeze a disputed payment: reverse every credit it granted that isn't reversed yet (the balance
 * may go negative), end its subscription, record the withdrawn money as a negative
 * `<id>:dispute:<disputeId>` row and flag the account for review. Idempotent per dispute.
 */
async function freezeDisputedPayment(
  ctx: Ctx,
  payment: PaymentRow,
  e: { disputeId: string; createdAt: Date; amountCents?: number; reason?: string; subscriptionId?: string },
): Promise<void> {
  const ended = payment.kind === "subscription" && (await endSubscription(ctx, e.subscriptionId, e.createdAt));
  const toReverse = Math.max(0, payment.credits - (await reversedCredits(ctx, payment)));
  if (toReverse > 0) {
    await applyCredit(
      {
        userId: payment.userId,
        delta: -toReverse,
        reason: "purchase_reversal",
        idempotencyKey: disputeKey(ctx, e.disputeId),
        paymentId: payment.id,
        note: "Payment disputed (chargeback)",
      },
      ctx.tx,
    );
  }

  const stillPaidCents =
    payment.status === "refunded" ? 0 : Math.max(0, payment.amountCents - (await partiallyRefundedCents(ctx, payment)));
  const [opened] = await ctx.tx
    .insert(payments)
    .values({
      userId: payment.userId,
      provider: ctx.provider,
      providerPaymentId: `${payment.providerPaymentId}${DISPUTE_ROW}${e.disputeId}`,
      kind: payment.kind,
      productId: payment.productId,
      amountCents: -Math.min(e.amountCents ?? stillPaidCents, stillPaidCents),
      currency: payment.currency,
      credits: -toReverse,
      status: "refunded",
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning({ id: payments.id });
  if (opened) {
    await flagDispute(ctx, payment, {
      phase: "opened",
      disputeId: e.disputeId,
      amountCents: e.amountCents ?? null,
      reason: e.reason ?? null,
      creditsReversed: toReverse,
      subscriptionEnded: ended,
    });
  }
  await recomputeHasPaid(ctx, payment.userId);
  if (ended) await recomputeUserPlan(ctx, payment.userId);
}

async function onDisputeOpened(ctx: Ctx, e: EventOf<"payment.disputed">): Promise<Outcome> {
  const payment = await lockPayment(ctx, e.paymentId);
  if (!payment) return orphan(e, `dispute ${e.disputeId} for unknown payment ${e.paymentId}`);
  await freezeDisputedPayment(ctx, payment, e);
}

async function onDisputeClosed(ctx: Ctx, e: EventOf<"payment.dispute_closed">): Promise<Outcome> {
  const payment = await lockPayment(ctx, e.paymentId);
  if (!payment) return orphan(e, `dispute ${e.disputeId} for unknown payment ${e.paymentId}`);

  if (!e.won) {
    // Lost: the money is gone for good. Freeze (a no-op if dispute.created was applied) and keep it so.
    await freezeDisputedPayment(ctx, payment, e);
    await flagDispute(ctx, payment, { phase: "closed", disputeId: e.disputeId, status: e.status });
    return;
  }

  // Won: give back what the dispute froze, minus anything a refund has claimed since, and drop the
  // negative revenue row. A subscription the dispute ended stays canceled (the user can subscribe again).
  const [frozen] = await ctx.tx
    .select({ delta: creditLedger.delta })
    .from(creditLedger)
    .where(eq(creditLedger.idempotencyKey, disputeKey(ctx, e.disputeId)))
    .limit(1);
  const refundClaim = await refundedCreditShare(ctx, payment);
  const restore = Math.min(frozen ? -frozen.delta : 0, Math.max(0, (await reversedCredits(ctx, payment)) - refundClaim));
  if (restore > 0) {
    await applyCredit(
      {
        userId: payment.userId,
        delta: restore,
        reason: "purchase_reversal",
        idempotencyKey: `${disputeKey(ctx, e.disputeId)}:won`,
        paymentId: payment.id,
        note: "Dispute won: credits restored",
      },
      ctx.tx,
    );
  }
  await ctx.tx
    .delete(payments)
    .where(
      and(
        eq(payments.provider, ctx.provider),
        eq(payments.providerPaymentId, `${payment.providerPaymentId}${DISPUTE_ROW}${e.disputeId}`),
      ),
    );
  await flagDispute(ctx, payment, { phase: "closed", disputeId: e.disputeId, status: e.status, creditsRestored: restore });
  await recomputeHasPaid(ctx, payment.userId);
}

/**
 * Money side of a refund, in the shape the admin revenue reports expect
 * (revenue = paid rows − fully refunded rows + negative refund rows):
 *  - full refund (nothing refunded before): the original row becomes "refunded", amount stays positive;
 *  - partial refund: a new row with a NEGATIVE amount for what this event refunded, status "refunded",
 *    providerPaymentId `<original>:refund:<eventId>`;
 *  - a full refund that completes earlier partial refunds: the remainder is another negative row (the
 *    original stays "paid"), so no amount is subtracted twice.
 */
async function recordRefund(
  ctx: Ctx,
  payment: PaymentRow,
  e: EventOf<"payment.refunded">,
  creditsReversed: number,
): Promise<void> {
  if (payment.status === "refunded") return;
  const prefix = `${payment.providerPaymentId}:refund:`;
  const [{ refundedCents }] = await ctx.tx
    .select({ refundedCents: sql<number>`coalesce(-sum(${payments.amountCents}), 0)`.mapWith(Number) })
    .from(payments)
    .where(
      and(
        eq(payments.userId, payment.userId),
        eq(payments.provider, ctx.provider),
        sql`starts_with(${payments.providerPaymentId}, ${prefix})`,
      ),
    );

  if (e.fullyRefunded && refundedCents === 0) {
    await ctx.tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
    return;
  }
  // `amountRefundedCents` is cumulative: this event refunded what isn't recorded yet.
  const target = e.fullyRefunded ? payment.amountCents : Math.min(e.amountRefundedCents, payment.amountCents);
  const refundCents = target - refundedCents;
  if (refundCents <= 0) return;
  await ctx.tx
    .insert(payments)
    .values({
      userId: payment.userId,
      provider: ctx.provider,
      providerPaymentId: `${prefix}${e.eventId}`,
      kind: payment.kind,
      productId: payment.productId,
      amountCents: -refundCents,
      currency: payment.currency,
      credits: -creditsReversed,
      status: "refunded",
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] });
}
