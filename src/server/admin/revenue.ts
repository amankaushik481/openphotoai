/** Payments listing for the revenue page. */
import { and, desc, eq, gte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { payments, user } from "@/db/schema";
import type { PaymentKind, PaymentProviderName } from "@/types/domain";
import { afterCursor, pageSize, paginate, periodStart } from "./util";

export interface AdminPaymentItem {
  id: string;
  userId: string;
  userEmail: string | null;
  provider: PaymentProviderName;
  providerPaymentId: string;
  kind: PaymentKind;
  productId: string;
  amountCents: number;
  currency: string;
  credits: number;
  status: "paid" | "refunded" | "failed";
  createdAt: Date;
}

/** Newest payments first, optionally limited to the last `days` UTC days. */
export async function listPayments(
  opts: { days?: number; status?: AdminPaymentItem["status"]; cursor?: string; limit?: number } = {},
): Promise<{ payments: AdminPaymentItem[]; nextCursor: string | null }> {
  const limit = pageSize(opts.limit);
  const conditions: SQL[] = [];
  if (opts.days) conditions.push(gte(payments.createdAt, periodStart(opts.days)));
  if (opts.status) conditions.push(eq(payments.status, opts.status));
  if (opts.cursor) conditions.push(afterCursor(payments, payments, opts.cursor));

  const rows = await db
    .select({
      id: payments.id,
      userId: payments.userId,
      userEmail: user.email,
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      kind: payments.kind,
      productId: payments.productId,
      amountCents: payments.amountCents,
      currency: payments.currency,
      credits: payments.credits,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(limit + 1);

  const page = paginate(rows, limit);
  return { payments: page.items, nextCursor: page.nextCursor };
}
