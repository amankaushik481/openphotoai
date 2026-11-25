"use client";

import { LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentHistoryItemDTO } from "@/server/billing/payment-history";
import { formatCreditDelta, formatMoney } from "./format";
import { LocalDate } from "./local-date";

const STATUS: Record<
  PaymentHistoryItemDTO["type"] | PaymentHistoryItemDTO["status"],
  { label: string; stamp: string }
> = {
  paid: { label: "Paid", stamp: "border-success/50 text-success" },
  refunded: { label: "Refunded", stamp: "border-warning/50 text-warning" },
  failed: { label: "Failed", stamp: "border-safelight-ink/60 text-safelight-ink" },
  refund: { label: "Refund", stamp: "border-foreground/30 text-muted-foreground" },
  chargeback: { label: "Chargeback", stamp: "border-safelight-ink/60 text-safelight-ink" },
  payment: { label: "Paid", stamp: "border-success/50 text-success" },
};

export interface PaymentHistoryProps {
  payments: PaymentHistoryItemDTO[];
  /** Stripe: invoices + card receipts live in the customer portal. */
  canManageBilling: boolean;
  testMode: boolean;
  onOpenPortal: () => void;
  openingPortal: boolean;
}

/** Payments, refunds and chargebacks (newest first), with where to find invoices. */
export function PaymentHistory({ payments, canManageBilling, testMode, onOpenPortal, openingPortal }: PaymentHistoryProps) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 border-y border-dashed border-foreground/30 py-6">
        <p aria-hidden="true" className="mono-caps text-muted-foreground">
          Receipts · none on file
        </p>
        <h3 className="font-display text-2xl leading-none">No payments yet</h3>
        <p className="text-sm text-muted-foreground">
          Credit packs and plan payments show up here, each with an emailed receipt.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Receipt slips: description, a dotted leader, the amount in mono, and a status stamp. */}
      <ul className="divide-y divide-dashed divide-foreground/20 border-y border-foreground/30" aria-label="Payments">
        {payments.map((p) => {
          const status = p.type === "payment" ? STATUS[p.status] : STATUS[p.type];
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.type === "refund" ? "Refund: " : p.type === "chargeback" ? "Chargeback: " : ""}
                  {p.description}
                </p>
                <p className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  <LocalDate iso={p.createdAt} />
                  {p.credits !== 0 && <> · {formatCreditDelta(p.credits)} credits</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={cn("border px-1.5 py-1 font-mono text-[10px] leading-none tracking-[0.14em] uppercase", status.stamp)}>
                  {status.label}
                </span>
                <span
                  className={cn(
                    "w-24 text-right font-mono text-sm font-medium tabular-nums",
                    p.amountCents < 0 && "text-muted-foreground",
                  )}
                >
                  {formatMoney(p.amountCents, p.currency)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {testMode
          ? "Test mode: payments are simulated, so there are no real invoices. Receipts still go to your inbox."
          : canManageBilling
            ? "We email a receipt for every payment. Invoices with tax details and your card receipts are in Manage billing."
            : "We email a receipt for every payment."}
      </p>
      {canManageBilling && !testMode && (
        <Button variant="outline" size="sm" className="self-start" onClick={onOpenPortal} disabled={openingPortal} aria-busy={openingPortal}>
          {openingPortal && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          View invoices
        </Button>
      )}
    </div>
  );
}
