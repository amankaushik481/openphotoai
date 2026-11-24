/**
 * Test-mode checkout (PAYMENT_PROVIDER=mock): "paying" a mock checkout signs the events Stripe
 * would send and runs them through the provider's webhook verification + `applyPaymentEvent`,
 * the same path as a real webhook delivery.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { env } from "@/lib/env";
import {
  decodeMockCheckoutId,
  mockCheckoutEvents,
  mockSubscriptionId,
  mockWebhookHeaders,
  serializeMockEvent,
  type MockCheckout,
} from "@/providers/payment/mock";
import { getPaymentProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { resolveCheckoutItem, type ResolvedCheckoutItem } from "./catalog";
import { applyPaymentEvent, ENTITLED_STATUSES } from "./events";
import { assertNotSubscribedTo } from "./service";

export function assertMockPayments(): void {
  if (env.paymentProvider !== "mock") throw errors.notFound();
}

/** Decode a checkout id and check it belongs to `userId`. */
export function loadMockCheckout(userId: string, checkoutId: string): { checkout: MockCheckout; item: ResolvedCheckoutItem } {
  const checkout = decodeMockCheckoutId(checkoutId);
  if (!checkout) throw errors.validation("This test checkout link is invalid or has expired. Start a new checkout.");
  if (checkout.userId !== userId) throw errors.forbidden("This checkout belongs to another account.");
  const item = resolveCheckoutItem(checkout.item);
  if (!item) throw errors.validation("This checkout is for a product that no longer exists.");
  return { checkout, item };
}

/** Pay a mock checkout. Idempotent: paying the same checkout again changes nothing. */
export async function completeMockCheckout(u: UserRow, checkoutId: string): Promise<{ processed: number }> {
  assertMockPayments();
  const { checkout } = loadMockCheckout(u.id, checkoutId);
  if (checkout.item.type === "plan") {
    const [paidAlready] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, u.id),
          eq(subscriptions.provider, "mock"),
          eq(subscriptions.providerSubscriptionId, mockSubscriptionId(checkout.checkoutId)),
        ),
      )
      .limit(1);
    // A second, different checkout for a plan the user already has would create a duplicate subscription.
    if (!paidAlready) await assertNotSubscribedTo(u.id, checkout.item.planId);
  }

  const provider = getPaymentProvider();
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/payments/mock`;
  let processed = 0;
  for (const event of mockCheckoutEvents(checkout)) {
    const rawBody = serializeMockEvent(event);
    const verified = await provider.parseWebhook({ headers: mockWebhookHeaders(rawBody), rawBody, url });
    const result = await applyPaymentEvent("mock", verified);
    if (result.status === "processed") processed += 1;
  }
  return { processed };
}

/** Test billing portal: cancel the user's subscriptions now (like a provider-side cancellation). */
export async function cancelMockSubscriptions(u: UserRow): Promise<{ canceled: number }> {
  assertMockPayments();
  const rows = await db
    .select({ id: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, u.id),
        eq(subscriptions.provider, "mock"),
        inArray(subscriptions.status, [...ENTITLED_STATUSES, "incomplete", "unpaid"]),
      ),
    );
  const provider = getPaymentProvider();
  for (const row of rows) await provider.cancelSubscription(row.id);
  return { canceled: rows.length };
}
