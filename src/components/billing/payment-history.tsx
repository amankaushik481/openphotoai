"use client";

import { LoaderCircleIcon, ReceiptIcon } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentHistoryItemDTO } from "@/server/billing/payment-history";
import { formatCreditDelta, formatMoney } from "./format";
import { LocalDate } from "./local-date";

const STATUS: Record<
  PaymentHistoryItemDTO["type"] | PaymentHistoryItemDTO["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  paid: { label: "Paid", variant: "success" },
  refunded: { label: "Refunded", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
  refund: { label: "Refund", variant: "outline" },
  chargeback: { label: "Chargeback", variant: "destructive" },
  payment: { label: "Paid", variant: "success" },
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
      <EmptyState
        size="sm"
        icon={<ReceiptIcon />}
        title="No payments yet"
        description="Credit packs and plan payments show up here, each with an emailed receipt."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-xl border bg-card" aria-label="Payments">
        {payments.map((p) => {
          const status = p.type === "payment" ? STATUS[p.status] : STATUS[p.type];
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.type === "refund" ? "Refund: " : p.type === "chargeback" ? "Chargeback: " : ""}
                  {p.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  <LocalDate iso={p.createdAt} />
                  {p.credits !== 0 && <> · {formatCreditDelta(p.credits)} credits</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className={cn("w-20 text-right text-sm font-medium tabular-nums", p.amountCents < 0 && "text-muted-foreground")}>
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
