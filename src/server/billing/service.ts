/**
 * Billing service: start a checkout, open the customer portal, summarize the user's billing state.
 * Payment state itself only changes through verified provider events (./events.ts).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { subscriptions, user } from "@/db/schema";
import type { SubscriptionRow, UserRow } from "@/db/types";
import { env } from "@/lib/env";
import { getPaymentProvider } from "@/providers/registry";
import type { CheckoutItem } from "@/providers/types";
import { AppError, errors } from "@/server/http";
import { checkoutItemSchema, resolveCheckoutItem, type PaidPlanId } from "./catalog";
import { ENTITLED_STATUSES } from "./events";
import type { BillingSummaryDTO, SubscriptionDTO } from "./types";

const billingUrl = () => `${env.NEXT_PUBLIC_APP_URL}/app/billing`;

function providerFailure(err: unknown): never {
  if (err instanceof AppError) throw err;
  console.error("[billing] payment provider error:", err);
  throw errors.provider("The payment provider is unavailable right now. Please try again in a minute.");
}

/** The user's subscriptions that currently grant plan benefits, best first. */
export async function listEntitledSubscriptions(userId: string): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ENTITLED_STATUSES])))
    .orderBy(desc(subscriptions.updatedAt));
}

async function customerIdOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ customerId: user.stripeCustomerId }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.customerId ?? null;
}

/** Throws conflict when the user already holds an entitled subscription to the same plan. */
export async function assertNotSubscribedTo(userId: string, planId: PaidPlanId): Promise<void> {
  const current = await listEntitledSubscriptions(userId);
  if (current.some((s) => s.planId === planId)) {
    throw errors.conflict(
      `You're already subscribed to the ${getPlan(planId).name} plan. Use “Manage billing” to change or cancel it.`,
    );
  }
}

/** Validate the item and create a provider checkout. Returns the URL to redirect the user to. */
export async function startCheckout(u: UserRow, item: CheckoutItem): Promise<{ url: string; checkoutId: string }> {
  const parsed = checkoutItemSchema.safeParse(item);
  if (!parsed.success) throw errors.validation("Invalid checkout item.", parsed.error.issues);
  const resolved = resolveCheckoutItem(parsed.data);
  if (!resolved) throw errors.validation(parsed.data.type === "plan" ? "Unknown plan." : "Unknown credit pack.");
  if (parsed.data.type === "plan") await assertNotSubscribedTo(u.id, parsed.data.planId);

  const customerId = await customerIdOf(u.id);
  try {
    return await getPaymentProvider().createCheckout({
      userId: u.id,
      email: u.email,
      customerId,
      item: parsed.data,
      successUrl: `${billingUrl()}?success=1`,
      cancelUrl: `${billingUrl()}?canceled=1`,
    });
  } catch (err) {
    providerFailure(err);
  }
}

/** Customer portal (manage payment method, invoices, cancel). Requires a billing customer. */
export async function openPortal(u: UserRow): Promise<{ url: string }> {
  const customerId = await customerIdOf(u.id);
  if (!customerId) {
    throw errors.conflict("You don't have a billing account yet. Buy a credit pack or subscribe first.");
  }
  try {
    return await getPaymentProvider().createPortal({ customerId, returnUrl: billingUrl() });
  } catch (err) {
    providerFailure(err);
  }
}

export function toSubscriptionDTO(row: SubscriptionRow): SubscriptionDTO {
  return {
    id: row.id,
    planId: row.planId,
    interval: row.interval,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    provider: row.provider,
  };
}

/** Current plan + subscription for the billing page and `GET /api/billing/subscription`. */
export async function getBillingSummary(userId: string): Promise<BillingSummaryDTO> {
  const [account] = await db
    .select({ plan: user.plan, hasPaid: user.hasPaid, customerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) throw errors.notFound("User");

  const [entitled] = await listEntitledSubscriptions(userId);
  const [latest] = entitled
    ? [entitled]
    : await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(1);

  return {
    subscription: latest ? toSubscriptionDTO(latest) : null,
    plan: account.plan,
    hasPaid: account.hasPaid,
    canManageBilling: Boolean(account.customerId),
    provider: env.paymentProvider,
  };
}
