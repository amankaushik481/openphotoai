/**
 * Public (signed-out) plan + credit-pack cards for the marketing pricing page. Server-renderable, no state:
 * CTAs send visitors to sign in and continue to in-app billing.
 */
import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { CREDIT_PACKS, PLANS, type Plan } from "@/config/plans";
import { formatCents } from "@/content/credit-costs";
import { cn, formatUsd } from "@/lib/utils";
import type { PlanId } from "@/types/domain";
import type { BillingInterval } from "./billing-interval-switch";

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

/** Sign-in URL that continues to in-app billing with the chosen item preselected. */
export function checkoutHref(params: Record<string, string>): string {
  const next = `/app/billing?${new URLSearchParams(params).toString()}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Plan limits as bullets, skipping any the plan's own highlights already mention. */
function planFeatures(plan: Plan): string[] {
  const l = plan.limits;
  const limits: [RegExp, string | null][] = [
    [/identity model/i, `${l.maxModels} identity model${l.maxModels === 1 ? "" : "s"}`],
    [/batch/i, `Batches of up to ${l.maxBatch} photos`],
    [/at once|parallel/i, `${l.maxConcurrentJobs} jobs at once`],
    [/\bapi\b/i, l.apiAccess ? "API access" : null],
    [/team|seat/i, l.teamSeats > 0 ? `Team of up to ${l.teamSeats}` : null],
    [/watermark/i, l.watermark ? "Watermark until first purchase" : "No watermark"],
  ];
  const extra = limits
    .filter(([re, text]) => text !== null && !plan.highlights.some((h) => re.test(h)))
    .map(([, text]) => text as string);
  return [...plan.highlights, ...extra];
}

export function MarketingPlanCards({ interval }: { interval: BillingInterval }) {
  const hasFootnote = ORDER.some((id) => PLANS[id].highlights.some((h) => h.endsWith("*")));
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((id) => {
          const plan = PLANS[id];
          const free = plan.monthlyPriceCents === 0;
          const yearly = interval === "yearly" && !free;
          const perMonth = yearly ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
          const features = planFeatures(plan);
          return (
            <li
              key={id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs",
                plan.popular && "border-brand-gradient shadow-lg lg:-my-3 lg:py-9",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {plan.popular && <Badge variant="brand">Most popular</Badge>}
              </div>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-5xl leading-none tracking-tight">{formatUsd(perMonth)}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </p>
              <p className="mt-1.5 min-h-5 text-xs text-muted-foreground">
                {free
                  ? "No card needed"
                  : yearly
                    ? `${formatUsd(plan.yearlyPriceCents)} billed yearly`
                    : "Billed monthly, cancel any time"}
              </p>
              <Button asChild variant={plan.popular ? "brand" : "outline"} className="mt-6 w-full">
                <Link href={free ? "/login" : checkoutHref({ plan: id, interval })}>
                  {free ? "Start free" : `Get ${plan.name}`}
                </Link>
              </Button>
              <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {hasFootnote && (
        <p className="text-center text-xs text-muted-foreground">
          * Draft previews are free and capped at {DRAFT_DAILY_LIMIT_FREE} a day before your first purchase,{" "}
          {DRAFT_DAILY_LIMIT} a day after.
        </p>
      )}
    </div>
  );
}

export function MarketingCreditPackCards() {
  return (
    <ul className="grid gap-4 sm:grid-cols-3">
      {CREDIT_PACKS.map((pack) => (
        <li
          key={pack.id}
          className={cn(
            "flex flex-col rounded-2xl border bg-card p-6 shadow-xs",
            pack.popular && "border-brand-gradient",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{pack.name}</h3>
            {pack.popular && <Badge variant="soft">Best value for most</Badge>}
          </div>
          <p className="mt-4 font-display text-4xl leading-none tracking-tight">{formatUsd(pack.priceCents)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatCents(pack.priceCents / pack.credits)} per credit · one-time · never expires
          </p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link href={checkoutHref({ pack: pack.id })}>Buy {pack.name}</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
