"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLANS, type Plan } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/types/domain";
import { formatCredits, formatPrice } from "./format";
import { useBillingActions } from "./use-billing-actions";

export type BillingInterval = "month" | "year";

export const PUBLIC_SIGNUP_HREF = "/login?next=/app/billing";

export interface PlanCardsProps {
  /** "public": buttons link to sign-in (pricing page). "app": buttons start a checkout. */
  mode: "public" | "app";
  /** App mode: the signed-in user's plan (its card is marked and disabled). */
  currentPlanId?: PlanId;
  defaultInterval?: BillingInterval;
  /** Show the Free plan card. Defaults to true in public mode. */
  includeFree?: boolean;
  className?: string;
}

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

/** Plan cards with a monthly / yearly toggle (yearly = 2 months free). */
export function PlanCards({ mode, currentPlanId = "free", defaultInterval = "month", includeFree, className }: PlanCardsProps) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>(defaultInterval);
  const { pending, checkout } = useBillingActions();
  const showFree = includeFree ?? mode === "public";
  const plans = ORDER.filter((id) => showFree || id !== "free").map((id) => PLANS[id]);
  const currentRank = ORDER.indexOf(currentPlanId);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={interval}
          onValueChange={(v) => v && setBillingInterval(v as BillingInterval)}
          aria-label="Billing period"
          className="w-full max-w-xs"
        >
          <ToggleGroupItem value="month" className="px-4">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="gap-2 px-4">
            Yearly
            <Badge variant="success" className="hidden min-[380px]:inline-flex">
              2 months free
            </Badge>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          plans.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {plans.map((plan) => {
          const isCurrent = mode === "app" && plan.id === currentPlanId;
          const key = `plan:${plan.id}:${interval}`;
          let action: React.ReactNode;
          if (mode === "public") {
            action = (
              <Button asChild className="w-full" variant={plan.popular ? "brand" : "outline"}>
                <Link href={PUBLIC_SIGNUP_HREF}>{plan.id === "free" ? "Start free" : `Get ${plan.name}`}</Link>
              </Button>
            );
          } else if (isCurrent) {
            action = (
              <Button className="w-full" variant="outline" disabled>
                Current plan
              </Button>
            );
          } else if (plan.id === "free") {
            action = null;
          } else {
            const upgrade = ORDER.indexOf(plan.id) > currentRank;
            action = (
              <Button
                className="w-full"
                variant={plan.popular ? "brand" : "outline"}
                disabled={pending !== null}
                aria-busy={pending === key}
                onClick={() => checkout({ type: "plan", planId: plan.id as Exclude<PlanId, "free">, interval }, key)}
              >
                {pending === key && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
                {upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
              </Button>
            );
          }
          return <PlanCard key={plan.id} plan={plan} interval={interval} isCurrent={isCurrent} action={action} />;
        })}
      </div>

      {mode === "app" && currentPlanId !== "free" && (
        <p className="text-center text-xs text-muted-foreground">
          Switching plans starts a new billing period; your current subscription is canceled automatically.
        </p>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  isCurrent,
  action,
}: {
  plan: Plan;
  interval: BillingInterval;
  isCurrent: boolean;
  action: React.ReactNode;
}) {
  const yearly = interval === "year" && plan.id !== "free";
  const perMonthCents = yearly ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
  const titleId = `plan-${plan.id}-title`;

  return (
    <Card
      aria-labelledby={titleId}
      className={cn("relative gap-5", plan.popular && "border-primary/50 shadow-md", isCurrent && "ring-2 ring-primary/40")}
    >
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle id={titleId} className="text-lg">
            {plan.name}
          </CardTitle>
          {isCurrent ? <Badge variant="soft">Your plan</Badge> : plan.popular ? <Badge variant="brand">Most popular</Badge> : null}
        </div>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatPrice(perMonthCents)}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 min-h-5 text-xs text-muted-foreground">
            {plan.id === "free"
              ? "No card needed"
              : yearly
                ? `${formatPrice(plan.yearlyPriceCents)} billed yearly · ${formatCredits(plan.monthlyCredits * 12)} credits up front`
                : `${formatCredits(plan.monthlyCredits)} credits every month`}
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {plan.highlights.map((h) => (
            <li key={h} className="flex gap-2">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      {action && <CardFooter>{action}</CardFooter>}
    </Card>
  );
}
