/**
 * Billing catalog helpers on top of src/config/plans.ts: checkout item validation, prices,
 * credits granted per purchase and human-readable descriptions (receipts, mock checkout).
 * Pure module (no database, no providers).
 */
import { z } from "zod";
import { getCreditPack, getPlan, PAID_PLAN_IDS, type CreditPack, type Plan } from "@/config/plans";
import type { CheckoutItem } from "@/providers/types";
import type { PlanId } from "@/types/domain";

export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";

export const BILLING_INTERVALS = ["month", "year"] as const satisfies readonly BillingInterval[];

export const checkoutItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), planId: z.enum(PAID_PLAN_IDS), interval: z.enum(BILLING_INTERVALS) }),
  z.object({ type: z.literal("credit_pack"), packId: z.string().trim().min(1).max(64) }),
]);

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/** Rank used when a user holds several subscriptions (higher wins). */
export function planRank(planId: PlanId): number {
  return planId === "free" ? 0 : PAID_PLAN_IDS.indexOf(planId) + 1;
}

export function planPriceCents(planId: PaidPlanId, interval: BillingInterval): number {
  const plan = getPlan(planId);
  return interval === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
}

/** Credits granted for one paid billing period: yearly plans get 12 months of credits up front. */
export function planGrantCredits(planId: PaidPlanId, interval: BillingInterval): number {
  const { monthlyCredits } = getPlan(planId);
  return interval === "year" ? monthlyCredits * 12 : monthlyCredits;
}

export function intervalLabel(interval: BillingInterval): string {
  return interval === "year" ? "yearly" : "monthly";
}

export function planDescription(planId: PaidPlanId, interval: BillingInterval): string {
  return `${getPlan(planId).name} plan (${intervalLabel(interval)})`;
}

export interface ResolvedCheckoutItem {
  item: CheckoutItem;
  name: string;
  description: string;
  priceCents: number;
  /** Credits granted when the purchase (first period, for plans) is paid. */
  credits: number;
  plan?: Plan;
  pack?: CreditPack;
}

/** Look up price + description for a checkout item. Returns null for unknown packs/plans. */
export function resolveCheckoutItem(item: CheckoutItem): ResolvedCheckoutItem | null {
  if (item.type === "plan") {
    if (!isPaidPlanId(item.planId) || !isBillingInterval(item.interval)) return null;
    const plan = getPlan(item.planId);
    return {
      item,
      name: planDescription(item.planId, item.interval),
      description: plan.description,
      priceCents: planPriceCents(item.planId, item.interval),
      credits: planGrantCredits(item.planId, item.interval),
      plan,
    };
  }
  const pack = getCreditPack(item.packId);
  if (!pack) return null;
  return {
    item,
    name: `${pack.name} credit pack`,
    description: `${pack.credits.toLocaleString("en-US")} credits that never expire.`,
    priceCents: pack.priceCents,
    credits: pack.credits,
    pack,
  };
}

/** "$39.00" (amounts are integer cents). */
export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** Approximate end of a billing period starting at `from` (used until the provider reports the real one). */
export function addBillingInterval(from: Date, interval: BillingInterval): Date {
  const end = new Date(from);
  if (interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}
