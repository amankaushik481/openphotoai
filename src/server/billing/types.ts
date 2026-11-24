/** Billing DTOs shared by the billing API routes and UI (type-only; safe to `import type` from client code). */
import type { PaymentProviderName, PlanId, SubscriptionStatus } from "@/types/domain";

export interface SubscriptionDTO {
  id: string;
  planId: PlanId;
  interval: "month" | "year";
  status: SubscriptionStatus;
  /** ISO date; null until the provider reports it. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: PaymentProviderName;
}

/** `GET /api/billing/subscription`. */
export interface BillingSummaryDTO {
  /** The user's current (entitled) subscription, else their most recent one, else null. */
  subscription: SubscriptionDTO | null;
  plan: PlanId;
  hasPaid: boolean;
  /** True once the user has a billing customer (the portal can be opened). */
  canManageBilling: boolean;
  /** "mock" means test mode: no real payments. */
  provider: PaymentProviderName;
}
