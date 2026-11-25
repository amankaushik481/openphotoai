/**
 * After a checkout redirects back to /app/billing?success=1, the payment provider's webhook may not
 * have arrived yet: the page must not claim "payment received" with an unchanged balance. These
 * helpers decide whether the payment is confirmed (pure, client-safe).
 */
import type { CreditLedgerEntryDTO, PlanId } from "@/types/domain";

export type CheckoutConfirmation =
  /** Waiting for the provider's webhook (poll quickly). */
  | { state: "confirming" }
  /** Confirmation is late: the payment is safe, keep checking slowly. */
  | { state: "delayed" }
  /** Credits or the plan changed: `credits` is what the purchase added (0 for a credit-less plan start). */
  | { state: "confirmed"; credits: number; planChanged: boolean };

/** Poll quickly for this long, then call the confirmation "delayed". */
export const CONFIRM_FAST_FOR_MS = 30_000;
/**
 * A purchase / plan grant this recent (relative to when the page opened) belongs to the checkout the
 * user just finished. The webhook is usually processed before the browser comes back, so it is
 * often slightly *older* than the page.
 */
export const RECENT_PAYMENT_MS = 5 * 60_000;

const PAYMENT_REASONS: ReadonlySet<CreditLedgerEntryDTO["reason"]> = new Set(["purchase", "subscription_grant"]);

export function checkoutConfirmation({
  ledger,
  plan,
  initialPlan,
  openedAt,
  now,
}: {
  /** Newest-first ledger page. */
  ledger: readonly CreditLedgerEntryDTO[];
  plan: PlanId;
  /** The plan when the page opened. */
  initialPlan: PlanId;
  /** ms epoch when the page opened. */
  openedAt: number;
  now: number;
}): CheckoutConfirmation {
  const since = openedAt - RECENT_PAYMENT_MS;
  const recent = ledger.filter((e) => PAYMENT_REASONS.has(e.reason) && Date.parse(e.createdAt) >= since && e.delta > 0);
  const planChanged = plan !== initialPlan;
  if (recent.length > 0 || planChanged) {
    return { state: "confirmed", credits: recent.reduce((sum, e) => sum + e.delta, 0), planChanged };
  }
  return now - openedAt >= CONFIRM_FAST_FOR_MS ? { state: "delayed" } : { state: "confirming" };
}
