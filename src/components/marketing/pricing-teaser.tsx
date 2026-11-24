import Link from "next/link";
import { ArrowRightIcon, InfinityIcon } from "lucide-react";

import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLANS, CREDIT_PACKS } from "@/config/plans";
import { DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { cn, formatUsd } from "@/lib/utils";
import type { PlanId } from "@/types/domain";

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

export function PricingTeaser() {
  const cheapestPack = CREDIT_PACKS.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  return (
    <MarketingSection labelledBy="pricing-title">
      <SectionHeading
        id="pricing-title"
        eyebrow="Pricing"
        title="Simple plans. Credits that don't vanish."
        lead="Subscribe if you shoot every month, or buy a one-time credit pack whenever you need one. Cancel in one click."
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((id) => {
          const plan = PLANS[id];
          return (
            <li
              key={id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs",
                plan.popular && "border-brand-gradient shadow-md",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{plan.name}</h3>
                {plan.popular && <Badge variant="brand">Most popular</Badge>}
              </div>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-5xl leading-none tracking-tight">
                  {formatUsd(plan.monthlyPriceCents)}
                </span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </p>
              <p className="mt-2 text-sm font-medium">
                {plan.monthlyCredits > 0
                  ? `${plan.monthlyCredits.toLocaleString("en-US")} credits every month`
                  : `${DRAFT_DAILY_LIMIT_FREE} free drafts a day`}
              </p>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{plan.description}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed bg-muted/30 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
            <InfinityIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Pay as you go</h3>
            <p className="text-sm text-muted-foreground">
              One-time credit packs from {formatUsd(cheapestPack.priceCents)} ({cheapestPack.name}). No subscription,
              and the credits never expire.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/pricing">
            See full pricing
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    </MarketingSection>
  );
}
