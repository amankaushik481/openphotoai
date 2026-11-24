/** Shared helpers for billing tests: event builders + DB readers. */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, emailOutbox, payments, subscriptions, user, webhookEvents } from "@/db/schema";
import { buildMockEvent, type MockEventFields } from "@/providers/payment/mock";
import type { NormalizedSubscription } from "@/providers/types";

export const T0 = new Date("2026-11-01T10:00:00Z");
export const at = (secondsAfterT0: number) => new Date(T0.getTime() + secondsAfterT0 * 1000);

export function packCheckout(userId: string, over: Partial<MockEventFields<"checkout.completed">> = {}) {
  return buildMockEvent("checkout.completed", {
    userId,
    customerId: "cus_test",
    mode: "payment",
    checkoutId: "cs_pack_1",
    creditPackId: "credits_500",
    amountCents: 3900,
    currency: "usd",
    createdAt: T0,
    ...over,
  });
}

export function sub(userId: string | undefined, over: Partial<NormalizedSubscription> = {}): NormalizedSubscription {
  return {
    subscriptionId: "sub_1",
    customerId: "cus_test",
    userId,
    planId: "pro",
    interval: "month",
    status: "active",
    currentPeriodEnd: new Date("2026-12-01T10:00:00Z"),
    cancelAtPeriodEnd: false,
    ...over,
  };
}

export function subscriptionCheckout(userId: string, over: Partial<MockEventFields<"checkout.completed">> = {}) {
  return buildMockEvent("checkout.completed", {
    userId,
    customerId: "cus_test",
    mode: "subscription",
    checkoutId: "cs_sub_1",
    planId: "pro",
    interval: "month",
    subscriptionId: "sub_1",
    amountCents: 3900,
    currency: "usd",
    createdAt: T0,
    ...over,
  });
}

export function invoicePaid(over: Partial<MockEventFields<"invoice.paid">> = {}) {
  return buildMockEvent("invoice.paid", {
    invoiceId: "in_1",
    subscriptionId: "sub_1",
    customerId: "cus_test",
    amountCents: 3900,
    currency: "usd",
    billingReason: "subscription_create",
    planId: "pro",
    interval: "month",
    createdAt: T0,
    ...over,
  });
}

export async function readUser(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row!;
}

export async function readLedger(userId: string) {
  return db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(asc(creditLedger.createdAt));
}

export async function readPayments(userId: string) {
  return db.select().from(payments).where(eq(payments.userId, userId));
}

export async function readSubscription(subscriptionId = "sub_1") {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, subscriptionId));
  return row;
}

export async function readWebhookEvent(eventId: string, source = "payment:mock") {
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, eventId)));
  return row;
}

export async function receipts(to: string) {
  return db.select().from(emailOutbox).where(and(eq(emailOutbox.to, to), eq(emailOutbox.template, "receipt")));
}
