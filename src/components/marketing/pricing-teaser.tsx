import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Folio, SHELL } from "@/components/marketing/editorial";
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { DRAFT_DAILY_LIMIT_FREE, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { CREDIT_PACKS, PAID_PLAN_IDS, PLANS, type Plan } from "@/config/plans";
import { CREDIT_COST_GROUPS, creditCostRows, formatCreditCost } from "@/content/credit-costs";
import { cn, formatUsd } from "@/lib/utils";
import type { PlanId } from "@/types/domain";

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

/** "Pro & Studio": names of the paid plans that include a capability. */
function plansWith(test: (limits: Plan["limits"]) => boolean): string {
  const names = PAID_PLAN_IDS.filter((id) => test(PLANS[id].limits)).map((id) => PLANS[id].name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "Paid plans");
}

/** One price-list line: label, dotted leader, figure. */
function Line({ label, note, value, strong }: { label: string; note?: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-baseline gap-2 py-2">
      <span className={cn("min-w-0", strong ? "font-medium" : "text-[0.9375rem]")}>
        {label}
        {note && <span className="ml-1.5 text-[0.8125rem] text-muted-foreground">{note}</span>}
      </span>
      <span
        aria-hidden="true"
        className="min-w-4 flex-1 translate-y-[-0.2em] border-b-2 border-dotted border-foreground/25"
      />
      <span className="shrink-0 font-mono text-[0.875rem] font-medium whitespace-nowrap tabular-nums">{value}</span>
    </li>
  );
}

/**
 * The photo lab's price board: every service and its credit cost (from CREDIT_COSTS), the plans and the
 * one-time packs (from config/plans), and what only some plans include.
 */
export function PricingTeaser() {
  const rows = creditCostRows();
  const cheapestPack = CREDIT_PACKS.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  const maxBatch = Math.max(...PAID_PLAN_IDS.map((id) => PLANS[id].limits.maxBatch));
  const extras: [string, string][] = [
    [`Batch ${maxBatch} in one click`, plansWith((l) => l.maxBatch === maxBatch)],
    ["Public API", plansWith((l) => l.apiAccess)],
    ["Team brand kits", plansWith((l) => l.teamSeats > 0)],
  ];
  return (
    <section aria-labelledby="pricing-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-6 lg:grid-cols-12 lg:gap-x-10")}>
        <Folio no="05" label="Price list" className="lg:col-span-12" />
        <h2
          id="pricing-title"
          className="font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em] lg:col-span-8"
        >
          Simple plans. <span className="block italic">Credits that don&apos;t vanish.</span>
        </h2>
        <p className="max-w-[30rem] text-lg leading-relaxed text-pretty text-muted-foreground lg:col-span-4 lg:self-end lg:pb-2">
          Subscribe if you shoot every month, or buy a one-time credit pack whenever you need one. Every action shows
          its cost before you click.
        </p>
      </div>

      <div className={cn(SHELL, "mt-14 grid gap-14 sm:mt-20 lg:grid-cols-12 lg:gap-x-10")}>
        {/* Services, as the lab prices them. */}
        <div className="lg:col-span-7">
          <div className="flex items-baseline justify-between border-b border-foreground pb-3">
            <h3 className="mono-caps">Lab services</h3>
            <p className="mono-caps text-muted-foreground">Credits</p>
          </div>
          <div className="grid gap-x-10 sm:grid-cols-2">
            {[CREDIT_COST_GROUPS.slice(0, 2), CREDIT_COST_GROUPS.slice(2)].map((groups, col) => (
              <div key={col}>
                {groups.map((group) => (
                  <div key={group.id} className="mt-6">
                    <h4 className="mono-caps text-[0.625rem] text-muted-foreground">{group.title}</h4>
                    <ul className="mt-1">
                      {rows
                        .filter((r) => r.group === group.id)
                        .map((r) => (
                          <Line
                            key={r.key}
                            label={r.label}
                            note={r.unit === "per image" ? undefined : r.unit}
                            value={formatCreditCost(r.credits).replace(/ credits?$/, " cr")}
                          />
                        ))}
                      {group.id === "identity" && <Line label="Instant identity model" value="Free" />}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-6 text-[0.8125rem] leading-relaxed text-muted-foreground">
            Per image unless noted. Photos from an Instant model cost {INSTANT_MODE_MULTIPLIER}× credits. Failed,
            blocked and below-threshold results are refunded automatically.
          </p>
        </div>

        {/* Plans board (first on phones: it's what most people came for). */}
        <div className="-order-1 lg:order-none lg:col-span-5">
          <div className="flex items-baseline justify-between border-b border-foreground pb-3">
            <h3 className="mono-caps">Plans</h3>
            <p className="mono-caps text-muted-foreground">Monthly</p>
          </div>
          <ul className="reveal">
            {ORDER.map((id) => {
              const plan = PLANS[id];
              return (
                <li key={id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-border py-5">
                  <span className="relative w-fit font-display text-[2.25rem] leading-none tracking-[-0.01em]">
                    {plan.name}
                    {plan.popular && (
                      <>
                        <GreasePencil
                          mark="circle"
                          variant={1}
                          strokeWidth={2.2}
                          className="absolute -top-3 -left-4 h-[calc(100%+1.5rem)] w-[calc(100%+2rem)]"
                        />
                        <span className="sr-only"> (most popular)</span>
                      </>
                    )}
                  </span>
                  <span className="justify-self-end font-mono text-2xl font-medium tabular-nums">
                    {formatUsd(plan.monthlyPriceCents)}
                  </span>
                  <span className="mt-2 text-[0.9375rem] text-muted-foreground">
                    {plan.monthlyCredits > 0
                      ? `${plan.monthlyCredits.toLocaleString("en-US")} credits every month`
                      : `${DRAFT_DAILY_LIMIT_FREE} free drafts a day, packs as you go`}
                  </span>
                  <span className="mono-caps mt-2 justify-self-end text-[0.625rem] text-muted-foreground">
                    {plan.popular ? "Most popular" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <ul className="mt-4">
            <Line
              label="Pay as you go"
              note={`${cheapestPack.name}, never expire`}
              value={`from ${formatUsd(cheapestPack.priceCents)}`}
              strong
            />
            {extras.map(([label, plans]) => (
              <Line key={label} label={label} value={plans} />
            ))}
          </ul>
          <Link
            href="/pricing"
            className="mt-8 inline-flex items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink"
          >
            See full pricing
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
