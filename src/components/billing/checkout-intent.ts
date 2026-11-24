/**
 * "Buy this after signing in" links: public pricing cards send visitors to
 * `/login?next=/app/billing?plan=pro&interval=year` (or `?pack=<id>`), and /app/billing turns those
 * params back into a checkout item it offers to start (after a confirmation).
 */
import { CREDIT_PACKS, PAID_PLAN_IDS } from "@/config/plans";
import type { CheckoutItem } from "@/providers/types";

export const BILLING_PATH = "/app/billing";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();

/** `/app/billing?…` that reopens checkout for `item`. */
export function checkoutIntentPath(item: CheckoutItem): string {
  const query =
    item.type === "plan"
      ? new URLSearchParams({ plan: item.planId, interval: item.interval })
      : new URLSearchParams({ pack: item.packId });
  return `${BILLING_PATH}?${query.toString()}`;
}

/** Sign-in link that continues to checkout for `item`. */
export function publicCheckoutHref(item: CheckoutItem): string {
  return `/login?next=${encodeURIComponent(checkoutIntentPath(item))}`;
}

/** The checkout item in /app/billing's search params, or null (unknown ids are ignored). */
export function parseCheckoutIntent(params: Params): CheckoutItem | null {
  const plan = first(params.plan);
  if (plan) {
    const planId = PAID_PLAN_IDS.find((id) => id === plan);
    if (!planId) return null;
    return { type: "plan", planId, interval: first(params.interval) === "year" ? "year" : "month" };
  }
  const pack = first(params.pack);
  if (pack && CREDIT_PACKS.some((p) => p.id === pack)) return { type: "credit_pack", packId: pack };
  return null;
}
