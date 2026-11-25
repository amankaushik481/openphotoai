/**
 * The user's own payments for the billing page's "Payments & receipts" list (read-only).
 * Refunds and chargebacks are stored as extra rows with negative amounts (see ./events.ts).
 */
import { desc, eq } from "drizzle-orm";
import { getCreditPack } from "@/config/plans";
import { db } from "@/db";
import { payments } from "@/db/schema";
import type { PaymentRow } from "@/db/types";
import type { PaymentKind } from "@/types/domain";
import { isBillingInterval, isPaidPlanId, planDescription } from "./catalog";

/** One row of the billing page's payment list (`import type` it from client code). */
export interface PaymentHistoryItemDTO {
  id: string;
  /** "refund" / "chargeback" rows carry negative amounts and credits. */
  type: "payment" | "refund" | "chargeback";
  kind: PaymentKind;
  description: string;
  amountCents: number;
  currency: string;
  /** Credits the payment granted (negative: taken back). */
  credits: number;
  status: "paid" | "refunded" | "failed";
  createdAt: string;
}

const DEFAULT_LIMIT = 24;

/** "Pro plan (monthly)", "500 credits credit pack", or the raw product id for retired products. */
export function paymentProductLabel(productId: string): string {
  const pack = getCreditPack(productId);
  if (pack) return `${pack.name} credit pack`;
  const [planId, interval] = productId.split("_");
  if (isPaidPlanId(planId) && isBillingInterval(interval)) return planDescription(planId, interval);
  return productId;
}

export function toPaymentHistoryItem(row: PaymentRow): PaymentHistoryItemDTO {
  const type = row.providerPaymentId.includes(":dispute:")
    ? "chargeback"
    : row.providerPaymentId.includes(":refund:")
      ? "refund"
      : "payment";
  return {
    id: row.id,
    type,
    kind: row.kind,
    description: paymentProductLabel(row.productId),
    amountCents: row.amountCents,
    currency: row.currency,
    credits: row.credits,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Newest first. */
export async function listPaymentHistory(userId: string, limit = DEFAULT_LIMIT): Promise<PaymentHistoryItemDTO[]> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(limit);
  return rows.map(toPaymentHistoryItem);
}
