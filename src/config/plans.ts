/**
 * Plans + one-time credit packs. CONTRACT FILE. Prices are in USD cents.
 * Stripe Checkout uses inline price_data built from these values, so self-hosters
 * do not need to create products in the Stripe dashboard (see docs/DECISIONS.md).
 * Optionally pin existing Stripe prices with STRIPE_PRICE_<PLAN>_<INTERVAL> env vars.
 */
import type { PlanId } from "@/types/domain";

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceCents: number;
  /** Total price billed yearly. */
  yearlyPriceCents: number;
  /** Credits granted each billing month (yearly plans get 12x up front... see billing module). */
  monthlyCredits: number;
  limits: {
    /** Max identity models a user can have at once. */
    maxModels: number;
    /** Max images in one batch click. */
    maxBatch: number;
    /** Max concurrent running jobs. */
    maxConcurrentJobs: number;
    apiAccess: boolean;
    teamSeats: number;
    watermark: boolean;
  };
  highlights: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Try it out. Buy a credit pack whenever you need more.",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    monthlyCredits: 0,
    limits: { maxModels: 1, maxBatch: 10, maxConcurrentJobs: 2, apiAccess: false, teamSeats: 0, watermark: true },
    highlights: ["5 free draft previews / day", "Pay-as-you-go credit packs", "Watermark until first purchase"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "For a fresh set of profile photos every month.",
    monthlyPriceCents: 1500,
    yearlyPriceCents: 15000,
    monthlyCredits: 200,
    limits: { maxModels: 2, maxBatch: 25, maxConcurrentJobs: 3, apiAccess: false, teamSeats: 0, watermark: false },
    highlights: ["200 credits / month", "2 identity models", "All 40+ photo packs", "No watermark", "Commercial use"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For creators, founders and job seekers who shoot a lot.",
    monthlyPriceCents: 3900,
    yearlyPriceCents: 39000,
    monthlyCredits: 600,
    popular: true,
    limits: { maxModels: 5, maxBatch: 50, maxConcurrentJobs: 6, apiAccess: true, teamSeats: 0, watermark: false },
    highlights: ["600 credits / month", "5 identity models", "Video + talking video", "Batch 50 in one click", "API access"],
  },
  studio: {
    id: "studio",
    name: "Studio",
    description: "For teams and agencies: brand kits and shared credits.",
    monthlyPriceCents: 9900,
    yearlyPriceCents: 99000,
    monthlyCredits: 2000,
    limits: { maxModels: 20, maxBatch: 50, maxConcurrentJobs: 10, apiAccess: true, teamSeats: 25, watermark: false },
    highlights: ["2,000 credits / month", "20 identity models", "Team brand kits (25 seats)", "10 jobs at once", "API access"],
  },
};

export const PAID_PLAN_IDS = ["starter", "pro", "studio"] as const;

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "credits_100", name: "100 credits", credits: 100, priceCents: 900 },
  { id: "credits_500", name: "500 credits", credits: 500, priceCents: 3900, popular: true },
  { id: "credits_1500", name: "1,500 credits", credits: 1500, priceCents: 9900 },
];

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function getPlan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free;
}

/** Free-tier outputs get a visible watermark until the user has ever paid. */
export function shouldWatermark(u: { plan: PlanId; hasPaid: boolean }, watermarkFreeTier = true): boolean {
  if (!watermarkFreeTier) return false;
  return getPlan(u.plan).limits.watermark && !u.hasPaid;
}

/** Whole months a yearly subscription saves vs. 12 monthly payments (0 for free / no discount). */
export function yearlyMonthsFree(plan: Plan): number {
  if (plan.monthlyPriceCents <= 0) return 0;
  const saved = (12 * plan.monthlyPriceCents - plan.yearlyPriceCents) / plan.monthlyPriceCents;
  return Math.max(0, Math.floor(saved + 1e-9));
}

/** What a "N months free" badge can promise for every paid plan (the smallest saving). */
export function minYearlyMonthsFree(planIds: readonly PlanId[] = PAID_PLAN_IDS): number {
  const savings = planIds.map((id) => yearlyMonthsFree(getPlan(id)));
  return savings.length ? Math.min(...savings) : 0;
}
