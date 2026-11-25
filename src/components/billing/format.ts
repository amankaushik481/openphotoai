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

/** Any currency, always with cents: "$39.00", "−$9.00", "€12.50". */
export function formatMoney(cents: number, currency = "usd"): string {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    Math.abs(cents) / 100,
  );
  return cents < 0 ? `−${formatted}` : formatted;
}

/**
 * "Nov 25, 2026". Defaults to UTC so the server render never depends on the host's time zone
 * (pass `timeZone: undefined` explicitly, after hydration, for the viewer's local day; see LocalDate).
 */
export function formatDate(iso: string | null | undefined, opts: { timeZone?: string | undefined } = { timeZone: "UTC" }): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: opts.timeZone });
}

/** "Nov 25, 2026, 3:04 PM" in the given time zone (local when undefined). */
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: timeZone === "UTC" ? "short" : undefined,
  });
}

export function formatCredits(n: number): string {
  return n.toLocaleString("en-US");
}

/** "+500" / "−20" with a real minus sign (never "+0"). */
export function formatCreditDelta(delta: number): string {
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${formatCredits(Math.abs(delta))}`;
}

/** Price per credit in cents, without a trailing ".0": "9¢", "7.8¢", "6.6¢". */
export function formatPerCredit(priceCents: number, credits: number): string {
  if (credits <= 0) return "—";
  const perCredit = Math.round((priceCents / credits) * 10) / 10;
  return `${perCredit.toLocaleString("en-US", { maximumFractionDigits: 1 })}¢`;
}

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  signup_bonus: "Welcome bonus",
  purchase: "Credit pack",
  subscription_grant: "Plan credits",
  job_debit: "Used",
  job_refund: "Refund",
  admin_adjust: "Adjustment by support",
  transfer_in: "Received from your team",
  transfer_out: "Sent to a teammate",
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
