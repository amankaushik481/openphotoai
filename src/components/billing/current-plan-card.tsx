"use client";

import { CreditCardIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPlan } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { BillingSummaryDTO } from "@/server/billing/types";
import { formatCredits, SUBSCRIPTION_STATUS_LABELS } from "./format";
import { LabNotice } from "./lab-notice";
import { LocalDate } from "./local-date";

/** Mono stamp colours per subscription status. */
const STATUS_STAMP = {
  active: "border-success/50 text-success",
  trialing: "border-success/50 text-success",
  past_due: "border-safelight-ink/60 text-safelight-ink",
  unpaid: "border-safelight-ink/60 text-safelight-ink",
  incomplete: "border-foreground/25 text-muted-foreground",
  canceled: "border-foreground/25 text-muted-foreground",
} as const;

const STAMP = "border px-1.5 py-1 font-mono text-[10px] leading-none tracking-[0.14em] uppercase";

export interface CurrentPlanCardProps {
  summary: BillingSummaryDTO;
  onManage: () => void;
  managing: boolean;
}

export function CurrentPlanCard({ summary, onManage, managing }: CurrentPlanCardProps) {
  const plan = getPlan(summary.plan);
  const sub = summary.subscription;
  const live = sub && sub.status !== "canceled" && sub.planId === summary.plan;
  const periodCredits = live && sub.interval === "year" ? plan.monthlyCredits * 12 : plan.monthlyCredits;
  const paymentFailed = live && (sub.status === "past_due" || sub.status === "unpaid");
  const testMode = summary.provider === "mock";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="mono-caps text-muted-foreground">Current plan</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-display text-5xl leading-none tracking-tight sm:text-6xl">{plan.name}</p>
          {live && <span className={cn(STAMP, STATUS_STAMP[sub.status])}>{SUBSCRIPTION_STATUS_LABELS[sub.status]}</span>}
          {live && (
            <span className={cn(STAMP, "border-foreground/25 text-muted-foreground")}>
              {sub.interval === "year" ? "Yearly" : "Monthly"}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 text-sm">
        {live ? (
          <>
            <p className="text-muted-foreground">
              {formatCredits(periodCredits)} credits every {sub.interval === "year" ? "year" : "month"}.
            </p>
            {sub.currentPeriodEnd && (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="mono-caps text-muted-foreground">
                  {sub.cancelAtPeriodEnd ? "Ends on " : paymentFailed ? "Payment was due on " : "Renews on "}
                </span>
                <LocalDate iso={sub.currentPeriodEnd} className="font-mono text-sm" />
              </p>
            )}
            {paymentFailed ? (
              <LabNotice role="alert" tone="danger" label="Lab notice · payment failed" title="Your last payment failed">
                <p>
                  {sub.status === "past_due"
                    ? `We'll retry the charge over the next few days. Update your card to keep ${plan.name}; your credits are safe either way.`
                    : `${plan.name} is paused until the payment goes through. Update your card to continue; your credits are safe.`}
                </p>
                {summary.canManageBilling && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={onManage}
                    disabled={managing}
                    aria-busy={managing}
                  >
                    {managing ? (
                      <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                    ) : (
                      <CreditCardIcon aria-hidden="true" />
                    )}
                    Update payment method
                  </Button>
                )}
              </LabNotice>
            ) : sub.cancelAtPeriodEnd ? (
              <LabNotice tone="warning" label="Lab notice · won't renew">
                Your subscription won&apos;t renew. You keep {plan.name} until the end of the period, then move to Free.
                Every credit you have stays on your account.
              </LabNotice>
            ) : (
              <p className="max-w-[62ch] text-xs text-muted-foreground">
                {testMode ? "Cancel in the test billing portal" : "Cancel anytime in Manage billing"}: you keep{" "}
                {plan.name} until the end of the period you paid for, then move to Free. Credits never disappear when
                you cancel.
              </p>
            )}
          </>
        ) : (
          <p className="max-w-[62ch] text-muted-foreground">
            {sub?.status === "canceled"
              ? `Your ${getPlan(sub.planId).name} subscription has ended. Your remaining credits stay on your account.`
              : "Pay as you go with credit packs, or pick a plan below for monthly credits and more features."}
          </p>
        )}
      </div>
      {summary.canManageBilling && (
        <Button variant="outline" onClick={onManage} disabled={managing} aria-busy={managing} className="w-full sm:w-fit">
          {managing ? (
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <CreditCardIcon aria-hidden="true" />
          )}
          Manage billing
        </Button>
      )}
    </div>
  );
}
