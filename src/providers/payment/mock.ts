/**
 * Mock payment provider (PAYMENT_PROVIDER=mock / MOCK_PROVIDERS=true).
 *
 * - `createCheckout` returns `/billing/mock-checkout?session=<checkoutId>`. The checkout id is a
 *   signed token (HMAC with the app secret) carrying the user id + item, so it can't be forged or
 *   re-targeted at another account. The mock checkout page "pays" by building the same events
 *   Stripe would send (`mockCheckoutEvents`) and feeding them through `parseWebhook` →
 *   `applyPaymentEvent`, exactly like a real webhook.
 * - Webhooks are JSON `PaymentEvent`s signed with `x-mock-signature` (`signMockPayload`).
 * - `getSubscription` reads our own DB; `cancelSubscription` applies a `subscription.deleted`
 *   event directly through the billing service.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { PAID_PLAN_IDS } from "@/config/plans";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { env } from "@/lib/env";
import {
  addBillingInterval,
  BILLING_INTERVALS,
  checkoutItemSchema,
  isPaidPlanId,
  resolveCheckoutItem,
} from "@/server/billing/catalog";
import type {
  CheckoutItem,
  NormalizedSubscription,
  PaymentEvent,
  PaymentProvider,
  WebhookRequest,
} from "@/providers/types";
import { PaymentWebhookError } from "./errors";

export const MOCK_PAYMENT_SIGNATURE_HEADER = "x-mock-signature";
const CHECKOUT_PREFIX = "mcs_";
/** Like a Stripe Checkout Session, a mock checkout link expires after 24 hours. */
export const MOCK_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

/* ───────────────────────────── signing ───────────────────────────── */

/** Purpose-bound key so a signature made for one use (e.g. AI mock webhooks) is useless for another. */
function signingKey(purpose: "webhook" | "checkout"): Buffer {
  return createHmac("sha256", env.authSecret).update(`openshoot:mock-payments:${purpose}:v1`).digest();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** HMAC-SHA256 (hex) of a mock webhook body — the `x-mock-signature` header value. */
export function signMockPayload(body: string): string {
  return createHmac("sha256", signingKey("webhook")).update(body).digest("hex");
}

/* ───────────────────────────── checkout ids ───────────────────────────── */

const checkoutPayloadSchema = z.object({
  v: z.literal(1),
  /** User id. */
  u: z.string().min(1),
  /** Customer id used for this checkout. */
  c: z.string().min(1),
  i: checkoutItemSchema,
  /** Issued at (ms). */
  t: z.number().int(),
  /** Nonce: two checkouts for the same item are different checkouts. */
  n: z.string().min(1),
});

export interface MockCheckout {
  checkoutId: string;
  userId: string;
  customerId: string;
  item: CheckoutItem;
  issuedAt: Date;
}

function checkoutSignature(encodedPayload: string): string {
  return createHmac("sha256", signingKey("checkout")).update(encodedPayload).digest("base64url");
}

export function encodeMockCheckoutId(args: { userId: string; customerId: string; item: CheckoutItem; issuedAt?: Date }): string {
  const payload: z.infer<typeof checkoutPayloadSchema> = {
    v: 1,
    u: args.userId,
    c: args.customerId,
    i: args.item,
    t: (args.issuedAt ?? new Date()).getTime(),
    n: randomBytes(6).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${CHECKOUT_PREFIX}${encoded}.${checkoutSignature(encoded)}`;
}

/** Verify + decode a mock checkout id. Returns null when forged, malformed or expired. */
export function decodeMockCheckoutId(checkoutId: string, now: Date = new Date()): MockCheckout | null {
  if (typeof checkoutId !== "string" || !checkoutId.startsWith(CHECKOUT_PREFIX) || checkoutId.length > 2048) return null;
  const [encoded, signature, ...rest] = checkoutId.slice(CHECKOUT_PREFIX.length).split(".");
  if (!encoded || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, checkoutSignature(encoded))) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = checkoutPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const issuedAt = new Date(parsed.data.t);
  if (now.getTime() - issuedAt.getTime() > MOCK_CHECKOUT_TTL_MS) return null;
  return { checkoutId, userId: parsed.data.u, customerId: parsed.data.c, item: parsed.data.i, issuedAt };
}

/** Deterministic mock customer id per user (the mock has no customer objects). */
export function mockCustomerId(userId: string): string {
  return `mock_cus_${userId}`;
}

/** Short stable tag derived from an id (keeps derived mock ids + event ids deterministic). */
function tagOf(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 24);
}

/** The subscription id a plan checkout creates once paid. */
export function mockSubscriptionId(checkoutId: string): string {
  return `mock_sub_${tagOf(checkoutId)}`;
}

/* ───────────────────────────── events ───────────────────────────── */

type EventType = PaymentEvent["type"];
type EventOf<T extends EventType> = Extract<PaymentEvent, { type: T }>;
export type MockEventFields<T extends EventType> = Omit<EventOf<T>, "type" | "eventId" | "createdAt"> & {
  eventId?: string;
  createdAt?: Date;
};

/** Build a normalized payment event (random event id + `now` unless given). Used by the mock flow and tests. */
export function buildMockEvent<T extends EventType>(type: T, fields: MockEventFields<T>): EventOf<T> {
  const { eventId, createdAt, ...rest } = fields;
  return {
    ...rest,
    type,
    eventId: eventId ?? `mock_evt_${randomBytes(10).toString("hex")}`,
    createdAt: createdAt ?? new Date(),
  } as unknown as EventOf<T>;
}

/** Serialize an event as the mock webhook body (dates become ISO strings). */
export function serializeMockEvent(event: PaymentEvent): string {
  return JSON.stringify(event);
}

/** Headers for a signed mock webhook delivery. */
export function mockWebhookHeaders(body: string): Headers {
  return new Headers({ "content-type": "application/json", [MOCK_PAYMENT_SIGNATURE_HEADER]: signMockPayload(body) });
}

/**
 * The events Stripe would send for a completed checkout, with deterministic ids (paying the same
 * checkout twice is a no-op):
 *  - credit pack: checkout.completed
 *  - plan: checkout.completed + subscription created (normalized as subscription.updated) + invoice.paid
 */
export function mockCheckoutEvents(checkout: MockCheckout, now: Date = new Date()): PaymentEvent[] {
  const resolved = resolveCheckoutItem(checkout.item);
  if (!resolved) throw new Error("Unknown checkout item");
  const tag = tagOf(checkout.checkoutId);
  const common = { userId: checkout.userId, customerId: checkout.customerId, checkoutId: checkout.checkoutId };

  if (checkout.item.type === "credit_pack") {
    return [
      buildMockEvent("checkout.completed", {
        ...common,
        eventId: `mock_evt_${tag}_checkout`,
        createdAt: now,
        mode: "payment",
        creditPackId: checkout.item.packId,
        amountCents: resolved.priceCents,
        currency: "usd",
      }),
    ];
  }

  const { planId, interval } = checkout.item;
  const subscriptionId = mockSubscriptionId(checkout.checkoutId);
  const subscription: NormalizedSubscription = {
    subscriptionId,
    customerId: checkout.customerId,
    userId: checkout.userId,
    planId,
    interval,
    status: "active",
    currentPeriodEnd: addBillingInterval(now, interval),
    cancelAtPeriodEnd: false,
  };
  return [
    buildMockEvent("checkout.completed", {
      ...common,
      eventId: `mock_evt_${tag}_checkout`,
      createdAt: now,
      mode: "subscription",
      planId,
      interval,
      subscriptionId,
      amountCents: resolved.priceCents,
      currency: "usd",
    }),
    buildMockEvent("subscription.updated", { eventId: `mock_evt_${tag}_sub_created`, createdAt: now, subscription }),
    buildMockEvent("invoice.paid", {
      eventId: `mock_evt_${tag}_invoice`,
      createdAt: now,
      invoiceId: `mock_in_${tag}`,
      subscriptionId,
      customerId: checkout.customerId,
      amountCents: resolved.priceCents,
      currency: "usd",
      billingReason: "subscription_create",
      planId,
      interval,
      userId: checkout.userId,
    }),
  ];
}

/* ───────────────────────────── webhook parsing ───────────────────────────── */

const paidPlanIdSchema = z.enum(PAID_PLAN_IDS);
const intervalSchema = z.enum(BILLING_INTERVALS);
const eventBase = { eventId: z.string().min(1).max(255), createdAt: z.coerce.date() };
const subscriptionSchema = z.object({
  subscriptionId: z.string().min(1),
  customerId: z.string().min(1),
  userId: z.string().min(1).optional(),
  planId: paidPlanIdSchema,
  interval: intervalSchema,
  status: z.enum(["active", "trialing", "past_due", "canceled", "incomplete", "unpaid"]),
  currentPeriodEnd: z.coerce.date().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

const paymentEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("checkout.completed"),
    userId: z.string().min(1),
    customerId: z.string().min(1).nullable(),
    mode: z.enum(["payment", "subscription"]),
    checkoutId: z.string().min(1),
    creditPackId: z.string().min(1).optional(),
    planId: paidPlanIdSchema.optional(),
    interval: intervalSchema.optional(),
    subscriptionId: z.string().min(1).optional(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3),
  }),
  z.object({ ...eventBase, type: z.literal("subscription.updated"), subscription: subscriptionSchema }),
  z.object({ ...eventBase, type: z.literal("subscription.deleted"), subscription: subscriptionSchema }),
  z.object({
    ...eventBase,
    type: z.literal("invoice.paid"),
    invoiceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    customerId: z.string().min(1),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3),
    billingReason: z.string().min(1),
    planId: paidPlanIdSchema.optional(),
    interval: intervalSchema.optional(),
    userId: z.string().min(1).optional(),
    totalCents: z.number().int().optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("invoice.payment_failed"),
    invoiceId: z.string().min(1),
    subscriptionId: z.string().min(1),
    customerId: z.string().min(1),
  }),
  z.object({
    ...eventBase,
    type: z.literal("payment.refunded"),
    paymentId: z.string().min(1),
    amountRefundedCents: z.number().int().nonnegative(),
    fullyRefunded: z.boolean(),
    subscriptionId: z.string().min(1).optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("payment.disputed"),
    paymentId: z.string().min(1),
    disputeId: z.string().min(1),
    amountCents: z.number().int().nonnegative(),
    reason: z.string().optional(),
    subscriptionId: z.string().min(1).optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("payment.dispute_closed"),
    paymentId: z.string().min(1),
    disputeId: z.string().min(1),
    won: z.boolean(),
    status: z.string().min(1),
  }),
  z.object({ ...eventBase, type: z.literal("ignored"), rawType: z.string() }),
]);

function parseMockWebhook(req: WebhookRequest): PaymentEvent {
  const given = req.headers.get(MOCK_PAYMENT_SIGNATURE_HEADER) ?? "";
  if (!given || !safeEqual(given, signMockPayload(req.rawBody))) {
    throw new PaymentWebhookError("Invalid mock payment webhook signature");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(req.rawBody);
  } catch {
    throw new PaymentWebhookError("Mock payment webhook body is not valid JSON");
  }
  const parsed = paymentEventSchema.safeParse(raw);
  if (!parsed.success) throw new PaymentWebhookError("Mock payment webhook body is not a valid payment event");
  return parsed.data;
}

/* ───────────────────────────── provider ───────────────────────────── */

async function loadMockSubscription(subscriptionId: string): Promise<NormalizedSubscription | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, "mock"), eq(subscriptions.providerSubscriptionId, subscriptionId)))
    .limit(1);
  if (!row || !isPaidPlanId(row.planId)) return null;
  return {
    subscriptionId: row.providerSubscriptionId,
    customerId: row.providerCustomerId ?? mockCustomerId(row.userId),
    userId: row.userId,
    planId: row.planId,
    interval: row.interval,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}

export function createMockPaymentProvider(): PaymentProvider {
  return {
    name: "mock",

    async createCheckout(input) {
      const checkoutId = encodeMockCheckoutId({
        userId: input.userId,
        customerId: input.customerId ?? mockCustomerId(input.userId),
        item: input.item,
      });
      const url = `${env.NEXT_PUBLIC_APP_URL}/billing/mock-checkout?session=${encodeURIComponent(checkoutId)}`;
      return { url, checkoutId };
    },

    async createPortal() {
      return { url: `${env.NEXT_PUBLIC_APP_URL}/app/billing?mockPortal=1` };
    },

    async parseWebhook(req) {
      return parseMockWebhook(req);
    },

    getSubscription: loadMockSubscription,

    async cancelSubscription(subscriptionId) {
      const current = await loadMockSubscription(subscriptionId);
      if (!current || current.status === "canceled") return;
      const event = buildMockEvent("subscription.deleted", {
        eventId: `mock_evt_${tagOf(subscriptionId)}_deleted`,
        subscription: { ...current, status: "canceled", cancelAtPeriodEnd: false },
      });
      // Lazy import: the billing service imports the provider registry, which imports this module.
      const { applyPaymentEvent } = await import("@/server/billing/events");
      await applyPaymentEvent("mock", event);
    },
  };
}
