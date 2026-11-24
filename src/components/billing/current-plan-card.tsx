"use client";

import { CalendarClockIcon, CreditCardIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlan } from "@/config/plans";
import type { BillingSummaryDTO } from "@/server/billing/types";
import { formatCredits, formatDate, SUBSCRIPTION_STATUS_LABELS } from "./format";

const STATUS_VARIANT = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  unpaid: "warning",
  incomplete: "outline",
  canceled: "outline",
} as const;

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

  return (
    <Card className="gap-4">
      <CardHeader className="gap-1.5">
        <CardDescription>Current plan</CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-display text-3xl font-normal">{plan.name}</CardTitle>
          {live && <Badge variant={STATUS_VARIANT[sub.status]}>{SUBSCRIPTION_STATUS_LABELS[sub.status]}</Badge>}
          {live && <Badge variant="outline">{sub.interval === "year" ? "Yearly" : "Monthly"}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        {live ? (
          <>
            <p className="text-muted-foreground">
              {formatCredits(periodCredits)} credits every {sub.interval === "year" ? "year" : "month"}.
            </p>
            {sub.currentPeriodEnd && (
              <p className="flex items-center gap-2">
                <CalendarClockIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                {sub.cancelAtPeriodEnd ? "Ends on " : "Renews on "}
                <time dateTime={sub.currentPeriodEnd} className="font-medium">
                  {formatDate(sub.currentPeriodEnd)}
                </time>
              </p>
            )}
            {sub.cancelAtPeriodEnd && (
              <Alert variant="warning">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertDescription>
                  Your subscription won&apos;t renew. You keep {plan.name} and your credits until the end of the period.
                </AlertDescription>
              </Alert>
            )}
            {(sub.status === "past_due" || sub.status === "unpaid") && (
              <Alert variant="warning">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertDescription>
                  Your last payment failed. Update your payment method in billing to keep your plan.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            {sub?.status === "canceled"
              ? `Your ${getPlan(sub.planId).name} subscription has ended. Your remaining credits stay on your account.`
              : "Pay as you go with credit packs, or pick a plan below for monthly credits and more features."}
          </p>
        )}
      </CardContent>
      {summary.canManageBilling && (
        <CardFooter>
          <Button variant="outline" onClick={onManage} disabled={managing} aria-busy={managing} className="w-full sm:w-auto">
            {managing ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <CreditCardIcon aria-hidden="true" />
            )}
            Manage billing
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
