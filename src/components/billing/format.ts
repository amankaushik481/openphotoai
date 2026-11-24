/** Display helpers for billing UI (client-safe). */
import type { CreditReason, SubscriptionStatus } from "@/types/domain";

/** "$39" for whole dollars, "$32.50" otherwise. */
export function formatPrice(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCredits(n: number): string {
  return n.toLocaleString("en-US");
}

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  signup_bonus: "Welcome bonus",
  purchase: "Credit pack",
  subscription_grant: "Plan credits",
  job_debit: "Used",
  job_refund: "Refund",
  admin_adjust: "Adjustment",
  transfer_in: "Team transfer",
  transfer_out: "Team transfer",
  purchase_reversal: "Payment refunded",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  unpaid: "Unpaid",
};
