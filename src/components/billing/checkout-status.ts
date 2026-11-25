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
  since,
}: {
  /** Newest-first ledger page. */
  ledger: readonly CreditLedgerEntryDTO[];
  plan: PlanId;
  /** The plan when the page opened. */
  initialPlan: PlanId;
  /** ms epoch when the page opened. */
  openedAt: number;
  now: number;
  /**
   * When this checkout was created (server ms epoch, carried in the success URL as `since`). Only
   * payments from then on count, so a purchase finished a few minutes earlier isn't mistaken for
   * this one. Without it (older links), anything from RECENT_PAYMENT_MS before the page opened counts.
   */
  since?: number | null;
}): CheckoutConfirmation {
  const from = since ?? openedAt - RECENT_PAYMENT_MS;
  const recent = ledger.filter((e) => PAYMENT_REASONS.has(e.reason) && Date.parse(e.createdAt) >= from && e.delta > 0);
  const planChanged = plan !== initialPlan;
  if (recent.length > 0 || planChanged) {
    return { state: "confirmed", credits: recent.reduce((sum, e) => sum + e.delta, 0), planChanged };
  }
  return now - openedAt >= CONFIRM_FAST_FOR_MS ? { state: "delayed" } : { state: "confirming" };
}

/** `since` from the success URL: a plausible recent server timestamp, else null (fall back to the window). */
export function parseCheckoutSince(raw: string | string[] | undefined, now = Date.now()): number | null {
  if (typeof raw !== "string" || !/^\d{10,16}$/.test(raw)) return null;
  const t = Number(raw);
  return t <= now + 60_000 && t >= now - 24 * 60 * 60_000 ? t : null;
}
