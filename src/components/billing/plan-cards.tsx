"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";

import { PencilCircle } from "@/components/gallery/marks";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { minYearlyMonthsFree, PLANS, type Plan } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/types/domain";
import { publicCheckoutHref } from "./checkout-intent";
import { formatCredits, formatPrice } from "./format";
import { useBillingActions } from "./use-billing-actions";

export type BillingInterval = "month" | "year";

export const PUBLIC_SIGNUP_HREF = "/login?next=/app/billing";
/** Free plan: just sign up (the app opens on the dashboard). */
const FREE_SIGNUP_HREF = "/login";

export interface PlanCardsProps {
  /** "public": buttons link to sign-in (pricing page). "app": buttons start a checkout. */
  mode: "public" | "app";
  /** App mode: the signed-in user's plan (its card is marked and disabled). */
  currentPlanId?: PlanId;
  defaultInterval?: BillingInterval;
  /** Show the Free plan card. Defaults to true in public mode. */
  includeFree?: boolean;
  /**
   * App mode: called instead of starting the checkout right away (e.g. to confirm a plan switch first).
   * Receives the checkout item and the button key (see `useBillingActions().pending`).
   */
  onChoose?: (item: PlanCheckoutItem, key: string) => void;
  className?: string;
}

export type PlanCheckoutItem = { type: "plan"; planId: Exclude<PlanId, "free">; interval: BillingInterval };

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

/** Mono tab with a safelight underline (the billing period switch). */
const TAB =
  "h-10 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase shadow-none first:rounded-none last:rounded-none hover:bg-transparent hover:text-foreground data-[state=on]:border-safelight-ink data-[state=on]:bg-transparent data-[state=on]:text-foreground pointer-coarse:h-11";

/** Plan cards with a monthly / yearly toggle (the yearly badge is derived from the plan prices). */
export function PlanCards({
  mode,
  currentPlanId = "free",
  defaultInterval = "month",
  includeFree,
  onChoose,
  className,
}: PlanCardsProps) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>(defaultInterval);
  const { pending, checkout } = useBillingActions();
  const showFree = includeFree ?? mode === "public";
  const plans = ORDER.filter((id) => showFree || id !== "free").map((id) => PLANS[id]);
  const currentRank = ORDER.indexOf(currentPlanId);
  const monthsFree = minYearlyMonthsFree();

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <ToggleGroup
          type="single"
          value={interval}
          onValueChange={(v) => v && setBillingInterval(v as BillingInterval)}
          aria-label="Billing period"
          className="gap-6"
        >
          <ToggleGroupItem value="month" className={TAB}>
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className={TAB}>
            Yearly
            {monthsFree > 0 && (
              <span className="hidden tracking-[0.1em] text-success min-[380px]:inline">
                · {monthsFree} {monthsFree === 1 ? "month" : "months"} free
              </span>
            )}
          </ToggleGroupItem>
        </ToggleGroup>
        {/* Narrow phones: the saving doesn't fit in the tab, so state it on its own line. */}
        {monthsFree > 0 && (
          <p className="font-mono text-[11px] tracking-[0.1em] text-success uppercase min-[380px]:hidden">
            Yearly: {monthsFree} {monthsFree === 1 ? "month" : "months"} free
          </p>
        )}
      </div>

      {/* Editorial columns: a heavy rule on top, hairlines between the plans. */}
      <div className="border-t border-foreground/25">
        <div
          className={cn(
            // gap-px over a hairline-coloured ground draws the rules between columns (and rows) at any count;
            // the negative margin lets the outer columns' text line up with the page.
            "grid gap-px bg-foreground/15 sm:-mx-5 sm:grid-cols-2",
            plans.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          {plans.map((plan) => {
            const isCurrent = mode === "app" && plan.id === currentPlanId;
            const key = `plan:${plan.id}:${interval}`;
            let action: React.ReactNode;
            if (mode === "public") {
              // Paid plans continue straight to checkout (with this interval) after signing in.
              const href =
                plan.id === "free"
                  ? FREE_SIGNUP_HREF
                  : publicCheckoutHref({ type: "plan", planId: plan.id as Exclude<PlanId, "free">, interval });
              action = (
                <Button asChild className="w-full" variant={plan.popular ? "brand" : "outline"}>
                  <Link href={href}>{plan.id === "free" ? "Start free" : `Get ${plan.name}`}</Link>
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
              const item: PlanCheckoutItem = { type: "plan", planId: plan.id as Exclude<PlanId, "free">, interval };
              action = (
                <Button
                  className="w-full"
                  variant={plan.popular ? "brand" : "outline"}
                  disabled={pending !== null}
                  aria-busy={pending === key}
                  onClick={() => (onChoose ? onChoose(item, key) : void checkout(item, key))}
                >
                  {pending === key && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
                  {upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                </Button>
              );
            }
            return (
              <PlanCard
                key={plan.id}
                index={plans.indexOf(plan)}
                plan={plan}
                interval={interval}
                isCurrent={isCurrent}
                action={action}
                // The app page nests plans under a "Plans" h2; the public page's section has no heading.
                titleAs={mode === "app" ? "h3" : "h2"}
              />
            );
          })}
        </div>
      </div>

      {mode === "app" && currentPlanId !== "free" && (
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          Switching plans starts a new billing period today and ends your current subscription right away, without a
          refund for unused time. Your credits stay.
        </p>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  index,
  interval,
  isCurrent,
  action,
  titleAs,
}: {
  plan: Plan;
  index: number;
  interval: BillingInterval;
  isCurrent: boolean;
  action: React.ReactNode;
  titleAs: "h2" | "h3";
}) {
  const yearly = interval === "year" && plan.id !== "free";
  const perMonthCents = yearly ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
  const titleId = `plan-${plan.id}-title`;
  const Title = titleAs;

  return (
    <article
      aria-labelledby={titleId}
      className={cn("relative flex flex-col gap-5 py-6 sm:px-5", isCurrent ? "bg-card" : "bg-background")}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p aria-hidden="true" className="mono-caps text-muted-foreground">
          No. {String(index + 1).padStart(2, "0")}
        </p>
        {isCurrent ? (
          <span className="border border-foreground/30 px-1.5 py-1 font-mono text-[10px] leading-none tracking-[0.16em] uppercase">
            Your plan
          </span>
        ) : plan.popular ? (
          <span className="relative px-2 py-1 font-mono text-[10px] leading-none tracking-[0.16em] text-safelight-ink uppercase">
            Most popular
            <PencilCircle
              variant={0}
              strokeWidth={1.8}
              className="absolute -inset-x-1 -inset-y-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.5rem)]"
            />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Title id={titleId} className="font-display text-4xl leading-none tracking-tight">
          {plan.name}
        </Title>
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </div>
      <div>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none tracking-tight tabular-nums">
            {formatPrice(perMonthCents)}
          </span>
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">/ month</span>
        </p>
        <p className="mt-2 min-h-5 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
          {plan.id === "free"
            ? "No card needed"
            : yearly
              ? `${formatPrice(plan.yearlyPriceCents)} billed yearly · ${formatCredits(plan.monthlyCredits * 12)} credits up front`
              : `${formatCredits(plan.monthlyCredits)} credits every month`}
        </p>
      </div>
      <ul className="flex flex-col border-t border-foreground/15 text-sm">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-2.5 border-b border-dotted border-foreground/20 py-2">
            <span aria-hidden="true" className="font-mono text-safelight-ink">
              —
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ul>
      {action && <div className="mt-auto pt-1">{action}</div>}
    </article>
  );
}
