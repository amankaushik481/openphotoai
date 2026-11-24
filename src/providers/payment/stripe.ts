/**
 * Stripe payment provider (stripe@23, API version pinned below).
 *
 * Checkout uses inline `price_data` built from src/config/plans.ts (docs/DECISIONS.md #13) unless an
 * existing Stripe price is pinned with an env var:
 *   STRIPE_PRICE_<PLANID>_<MONTH|YEAR>   e.g. STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_STUDIO_YEAR
 *   STRIPE_PRICE_<PACKID>                e.g. STRIPE_PRICE_CREDITS_500
 * Webhooks are verified with `constructEventAsync` and normalized into provider-agnostic
 * `PaymentEvent`s (see `normalizeStripeEvent`). The SDK is imported lazily on first use.
 *
 * Webhook events to enable on the endpoint (`STRIPE_WEBHOOK_EVENTS`):
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted,
 *   invoice.paid, invoice.payment_failed, charge.refunded,
 *   charge.dispute.created, charge.dispute.closed   (charge.dispute.funds_withdrawn is optional)
 */
import type Stripe from "stripe";
import { APP } from "@/config/app";
import { getCreditPack, getPlan, PAID_PLAN_IDS } from "@/config/plans";
import {
  BILLING_INTERVALS,
  isBillingInterval,
  isPaidPlanId,
  type BillingInterval,
  type PaidPlanId,
} from "@/server/billing/catalog";
import type {
  CheckoutInput,
  CheckoutItem,
  NormalizedSubscription,
  PaymentEvent,
  PaymentProvider,
  WebhookRequest,
} from "@/providers/types";
import type { SubscriptionStatus } from "@/types/domain";
import { PaymentWebhookError } from "./errors";

/** The webhook events `normalizeStripeEvent` acts on; subscribe the endpoint to all of them. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;

/** The API version stripe@23 is typed against. Bump together with the SDK. */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-11-18.endive";

export interface StripePaymentProviderOptions {
  secretKey: string;
  webhookSecret: string;
}

type PlanMeta = { planId?: PaidPlanId; interval?: BillingInterval; userId?: string };
type Expandable = string | { id: string } | null | undefined;

const idOf = (value: Expandable): string | null => (value == null ? null : typeof value === "string" ? value : value.id);

/* ───────────────────────────── prices ───────────────────────────── */

function envKeyPart(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Env var that pins an existing Stripe price for a checkout item. */
export function stripePriceEnvVar(item: CheckoutItem): string {
  return item.type === "plan"
    ? `STRIPE_PRICE_${envKeyPart(item.planId)}_${envKeyPart(item.interval)}`
    : `STRIPE_PRICE_${envKeyPart(item.packId)}`;
}

function pinnedPriceId(item: CheckoutItem): string | undefined {
  const value = process.env[stripePriceEnvVar(item)]?.trim();
  return value ? value : undefined;
}

/** Reverse lookup: which plan/interval does a pinned Stripe price id belong to? */
function planFromPinnedPrice(priceId: string): PlanMeta {
  for (const planId of PAID_PLAN_IDS) {
    for (const interval of BILLING_INTERVALS) {
      if (pinnedPriceId({ type: "plan", planId, interval }) === priceId) return { planId, interval };
    }
  }
  return {};
}

function lineItem(item: CheckoutItem): Stripe.Checkout.SessionCreateParams.LineItem {
  const pinned = pinnedPriceId(item);
  if (pinned) return { price: pinned, quantity: 1 };

  if (item.type === "plan") {
    const plan = getPlan(item.planId);
    return {
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: item.interval === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents,
        recurring: { interval: item.interval },
        product_data: {
          name: `${APP.name} ${plan.name} (${item.interval === "year" ? "yearly" : "monthly"})`,
          description: plan.description,
          metadata: { planId: item.planId, interval: item.interval },
        },
      },
    };
  }
  const pack = getCreditPack(item.packId);
  if (!pack) throw new Error(`Unknown credit pack "${item.packId}"`);
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: pack.priceCents,
      product_data: {
        name: `${APP.name} ${pack.name}`,
        description: `${pack.credits.toLocaleString("en-US")} credits. Credits never expire.`,
      },
    },
  };
}

/**
 * STRIPE_ALLOW_PROMOTION_CODES=true shows the promotion-code box at checkout. Off by default: Stripe
 * accepts every active promotion code in the account there, including ones made for other products.
 */
function promotionCodesAllowed(): boolean {
  return process.env.STRIPE_ALLOW_PROMOTION_CODES?.trim().toLowerCase() === "true";
}

/** Metadata attached to the session (and its subscription): string values only. */
export function checkoutMetadata(userId: string, item: CheckoutItem): Record<string, string> {
  return item.type === "plan"
    ? { userId, kind: "plan", planId: item.planId, interval: item.interval }
    : { userId, kind: "credit_pack", creditPackId: item.packId };
}

/* ───────────────────────────── normalization ───────────────────────────── */

function readPlanMeta(meta: Stripe.Metadata | null | undefined): PlanMeta {
  if (!meta) return {};
  return {
    planId: isPaidPlanId(meta.planId) ? meta.planId : undefined,
    interval: isBillingInterval(meta.interval) ? meta.interval : undefined,
    userId: meta.userId ? meta.userId : undefined,
  };
}

/**
 * Plan + interval from the price actually billed: a pinned price id, then price / product metadata
 * (inline prices carry it on `product_data`), then the price's recurring interval. This wins over
 * subscription metadata, which goes stale when the plan is changed outside our checkout (Customer
 * Portal, dashboard, API).
 */
function planFromPrice(price: Stripe.Price | string | null | undefined): PlanMeta {
  if (!price) return {};
  if (typeof price === "string") return planFromPinnedPrice(price);
  const product = typeof price.product === "object" && price.product && "metadata" in price.product ? price.product : null;
  const fromPrice = readPlanMeta(price.metadata);
  const fromProduct = readPlanMeta(product?.metadata);
  const recurring = price.recurring?.interval;
  return mergeMeta(
    planFromPinnedPrice(price.id),
    { planId: fromPrice.planId, interval: fromPrice.interval },
    { planId: fromProduct.planId, interval: fromProduct.interval },
    { interval: isBillingInterval(recurring) ? recurring : undefined },
  );
}

/** First defined value per key, in priority order. */
function mergeMeta(...sources: PlanMeta[]): PlanMeta {
  const out: PlanMeta = {};
  for (const s of sources) {
    out.planId ??= s.planId;
    out.interval ??= s.interval;
    out.userId ??= s.userId;
  }
  return out;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  unpaid: "unpaid",
  incomplete_expired: "canceled",
  // Paused subscriptions collect no payment: no plan benefits until resumed.
  paused: "unpaid",
};

/** Normalize a Stripe subscription. Null when it isn't one of our plans. */
export function normalizeSubscription(sub: Stripe.Subscription): NormalizedSubscription | null {
  const items = sub.items?.data ?? [];
  // The billed price first: subscription metadata only reflects the plan bought at checkout.
  const meta = mergeMeta(...items.map((i) => planFromPrice(i.price)), readPlanMeta(sub.metadata));
  const customerId = idOf(sub.customer);
  if (!meta.planId || !meta.interval || !customerId) return null;

  const periodEnds = items.map((i) => i.current_period_end).filter((n): n is number => Number.isFinite(n));
  return {
    subscriptionId: sub.id,
    customerId,
    userId: meta.userId,
    planId: meta.planId,
    interval: meta.interval,
    status: STATUS_MAP[sub.status] ?? "incomplete",
    currentPeriodEnd: periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || (sub.cancel_at != null && sub.status !== "canceled"),
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = idOf(invoice.parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;
  for (const line of invoice.lines?.data ?? []) {
    const id = idOf(line.subscription) ?? line.parent?.subscription_item_details?.subscription ?? null;
    if (id) return id;
  }
  return null;
}

function invoicePlanMeta(invoice: Stripe.Invoice): PlanMeta {
  // Charged lines first: a proration invoice also lists the previous price as a credit line.
  const lines = [...(invoice.lines?.data ?? [])].sort((a, b) => Number((b.amount ?? 0) > 0) - Number((a.amount ?? 0) > 0));
  return mergeMeta(
    ...lines.map((line) => planFromPrice(line.pricing?.price_details?.price)),
    ...lines.map((line) => readPlanMeta(line.metadata)),
    readPlanMeta(invoice.parent?.subscription_details?.metadata),
  );
}

function ignored(event: Stripe.Event, createdAt: Date): PaymentEvent {
  return { type: "ignored", eventId: event.id, createdAt, rawType: event.type };
}

function normalizeCheckout(event: Stripe.Event, session: Stripe.Checkout.Session, createdAt: Date): PaymentEvent {
  const meta = readPlanMeta(session.metadata);
  // Our server-set metadata wins: `client_reference_id` can be chosen by whoever opens a Payment Link.
  const userId = meta.userId ?? session.client_reference_id;
  const mode = session.mode === "payment" ? "payment" : session.mode === "subscription" ? "subscription" : null;
  const kind = session.metadata?.kind;
  const ours = (mode === "payment" && kind === "credit_pack") || (mode === "subscription" && kind === "plan");
  // Not started by our checkout (Payment Links, other products in the same Stripe account, setup
  // mode) or an async payment that hasn't settled yet (checkout.session.async_payment_succeeded follows).
  if (!userId || !mode || !ours) return ignored(event, createdAt);
  if (mode === "payment" && session.payment_status === "unpaid") return ignored(event, createdAt);

  return {
    type: "checkout.completed",
    eventId: event.id,
    createdAt,
    userId,
    customerId: idOf(session.customer),
    mode,
    checkoutId: session.id,
    creditPackId: session.metadata?.creditPackId || undefined,
    planId: meta.planId,
    interval: meta.interval,
    subscriptionId: idOf(session.subscription) ?? undefined,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
  };
}

/** What a charge paid for: the id we stored in `payments` (checkout session or invoice). */
interface PaymentTarget {
  paymentId: string;
  /** For invoices: the subscription billed. */
  subscriptionId?: string;
}

const OUR_KINDS = new Set(["plan", "credit_pack"]);

/**
 * Find the checkout session or invoice a payment intent paid for. Null when there is none or it
 * wasn't created by our checkout (another product sharing the Stripe account): those events are
 * ignored instead of being retried for days.
 */
async function paymentTarget(stripe: Stripe, paymentIntent: string | null, what: string): Promise<PaymentTarget | null> {
  if (!paymentIntent) return null;
  try {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
    const session = sessions.data[0];
    if (session) return OUR_KINDS.has(session.metadata?.kind ?? "") ? { paymentId: session.id } : null;
    const invoicePayments = await stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: paymentIntent },
      limit: 1,
      expand: ["data.invoice"],
    });
    const invoice = invoicePayments.data[0]?.invoice;
    if (!invoice) return null;
    if (typeof invoice === "string") return { paymentId: invoice };
    if ("deleted" in invoice && invoice.deleted) return { paymentId: invoice.id };
    const details = invoice.parent?.subscription_details;
    const meta = readPlanMeta(details?.metadata);
    const ours = details?.metadata?.kind === "plan" || Boolean(meta.userId) || Boolean(invoicePlanMeta(invoice).planId);
    if (!ours || !invoice.id) return null;
    return { paymentId: invoice.id, subscriptionId: idOf(details?.subscription) ?? undefined };
  } catch (err) {
    throw new PaymentWebhookError(`Could not resolve the payment behind ${what}`, { retryable: true, cause: err });
  }
}

/** Disputes the merchant keeps the money for: "won", or an inquiry closed without a chargeback. */
const DISPUTE_KEPT_STATUSES = new Set<string>(["won", "warning_closed"]);

function disputePaymentIntent(dispute: Stripe.Dispute): string | null {
  const fromDispute = idOf(dispute.payment_intent);
  if (fromDispute) return fromDispute;
  return typeof dispute.charge === "object" && dispute.charge ? idOf(dispute.charge.payment_intent) : null;
}

/** Map a verified Stripe event to a `PaymentEvent` (unknown/foreign events → "ignored"). */
export async function normalizeStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<PaymentEvent> {
  const createdAt = new Date(event.created * 1000);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return normalizeCheckout(event, event.data.object, createdAt);

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = normalizeSubscription(event.data.object);
      if (!subscription) return ignored(event, createdAt);
      const type = event.type === "customer.subscription.deleted" ? "subscription.deleted" : "subscription.updated";
      return { type, eventId: event.id, createdAt, subscription };
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      const customerId = idOf(invoice.customer);
      if (!subscriptionId || !customerId) return ignored(event, createdAt);
      const meta = invoicePlanMeta(invoice);
      return {
        type: "invoice.paid",
        eventId: event.id,
        createdAt,
        invoiceId: invoice.id,
        subscriptionId,
        customerId,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        billingReason: invoice.billing_reason ?? "subscription",
        planId: meta.planId,
        interval: meta.interval,
        userId: meta.userId,
        ...(typeof invoice.total === "number" ? { totalCents: invoice.total } : {}),
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      const customerId = idOf(invoice.customer);
      if (!subscriptionId || !customerId) return ignored(event, createdAt);
      return { type: "invoice.payment_failed", eventId: event.id, createdAt, invoiceId: invoice.id, subscriptionId, customerId };
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const target = await paymentTarget(stripe, idOf(charge.payment_intent), `charge ${charge.id}`);
      if (!target) return ignored(event, createdAt);
      return {
        type: "payment.refunded",
        eventId: event.id,
        createdAt,
        paymentId: target.paymentId,
        amountRefundedCents: charge.amount_refunded,
        fullyRefunded: charge.refunded,
        ...(target.subscriptionId ? { subscriptionId: target.subscriptionId } : {}),
      };
    }

    // Chargebacks: Stripe sends no charge.refunded when a dispute is lost.
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object;
      const target = await paymentTarget(stripe, disputePaymentIntent(dispute), `dispute ${dispute.id}`);
      if (!target) return ignored(event, createdAt);
      return {
        type: "payment.disputed",
        eventId: event.id,
        createdAt,
        paymentId: target.paymentId,
        disputeId: dispute.id,
        amountCents: dispute.amount,
        reason: dispute.reason,
        ...(target.subscriptionId ? { subscriptionId: target.subscriptionId } : {}),
      };
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const target = await paymentTarget(stripe, disputePaymentIntent(dispute), `dispute ${dispute.id}`);
      if (!target) return ignored(event, createdAt);
      return {
        type: "payment.dispute_closed",
        eventId: event.id,
        createdAt,
        paymentId: target.paymentId,
        disputeId: dispute.id,
        won: DISPUTE_KEPT_STATUSES.has(dispute.status),
        status: dispute.status,
      };
    }

    default:
      return ignored(event, createdAt);
  }
}

function isMissingResource(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "resource_missing";
}

/* ───────────────────────────── provider ───────────────────────────── */

export function createStripePaymentProvider(opts: StripePaymentProviderOptions): PaymentProvider {
  let client: Promise<Stripe> | undefined;
  const stripe = (): Promise<Stripe> => {
    client ??= import("stripe").then(
      ({ default: StripeSDK }) =>
        new StripeSDK(opts.secretKey, {
          apiVersion: STRIPE_API_VERSION,
          typescript: true,
          maxNetworkRetries: 2,
          appInfo: { name: APP.name },
        }),
    );
    client.catch(() => {
      client = undefined;
    });
    return client;
  };

  return {
    name: "stripe",

    async createCheckout(input: CheckoutInput) {
      const s = await stripe();
      const metadata = checkoutMetadata(input.userId, input.item);
      const isPlan = input.item.type === "plan";
      const session = await s.checkout.sessions.create({
        mode: isPlan ? "subscription" : "payment",
        line_items: [lineItem(input.item)],
        client_reference_id: input.userId,
        metadata,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: promotionCodesAllowed(),
        automatic_tax: { enabled: false },
        ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
        ...(isPlan
          ? { subscription_data: { metadata } }
          : {
              payment_intent_data: { metadata },
              // Always create a customer for one-time purchases so the billing portal works afterwards.
              ...(input.customerId ? {} : { customer_creation: "always" as const }),
            }),
      });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { url: session.url, checkoutId: session.id };
    },

    async createPortal({ customerId, returnUrl }) {
      const s = await stripe();
      const portal = await s.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: portal.url };
    },

    async parseWebhook(req: WebhookRequest) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new PaymentWebhookError("Missing Stripe-Signature header");
      const s = await stripe();
      let event: Stripe.Event;
      try {
        event = await s.webhooks.constructEventAsync(req.rawBody, signature, opts.webhookSecret);
      } catch (err) {
        throw new PaymentWebhookError("Invalid Stripe webhook signature", { cause: err });
      }
      return normalizeStripeEvent(s, event);
    },

    async getSubscription(subscriptionId) {
      const s = await stripe();
      try {
        return normalizeSubscription(await s.subscriptions.retrieve(subscriptionId));
      } catch (err) {
        if (isMissingResource(err)) return null;
        throw err;
      }
    },

    async cancelSubscription(subscriptionId) {
      const s = await stripe();
      try {
        await s.subscriptions.cancel(subscriptionId);
      } catch (err) {
        if (isMissingResource(err)) return;
        throw err;
      }
    },
  };
}
