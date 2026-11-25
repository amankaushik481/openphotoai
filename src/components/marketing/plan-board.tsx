/**
 * The public pricing page's price board: plans set as editorial columns between hairlines, and the one-time
 * credit packs as a lab price list. Server components with zero JS: the monthly/yearly switch is a pair of
 * native radios, and CSS (`:has()`) shows the matching prices and checkout links.
 */
import Link from "next/link";

import { publicCheckoutHref } from "@/components/billing/checkout-intent";
import { formatCredits, formatPerCredit, formatPrice } from "@/components/billing/format";
import { Leader } from "@/components/marketing/editorial";
import { buttonVariants } from "@/components/ui/button";
import { CREDIT_PACKS, minYearlyMonthsFree, PLANS, type Plan } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/types/domain";

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

/* Visibility per billing period, driven by the yearly radio inside the `board` group. */
const MONTHLY_ONLY = "group-has-[[data-interval=year]:checked]/board:hidden";
const YEARLY_ONLY = "hidden group-has-[[data-interval=year]:checked]/board:block";
const YEARLY_ONLY_FLEX = "hidden group-has-[[data-interval=year]:checked]/board:flex";

const toggleOption =
  "relative inline-flex h-10 cursor-pointer items-center gap-2 px-4 font-mono text-xs font-medium tracking-[0.14em] uppercase transition-colors select-none hover:text-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring pointer-coarse:h-11";

/** Monthly / yearly switch: native radios (keyboard + screen readers for free), styled as a segmented control. */
function IntervalSwitch() {
  const monthsFree = minYearlyMonthsFree();
  return (
    <fieldset>
      <legend className="sr-only">Billing period</legend>
      <div className="inline-flex rounded-[2px] border border-foreground p-0.5 text-muted-foreground">
        <label className={toggleOption}>
          <input
            type="radio"
            name="billing-interval"
            value="month"
            data-interval="month"
            defaultChecked
            className="sr-only"
          />
          Monthly
        </label>
        <label className={toggleOption}>
          <input type="radio" name="billing-interval" value="year" data-interval="year" className="sr-only" />
          Yearly
          {monthsFree > 0 && (
            <span className="text-safelight-ink normal-case group-has-[[data-interval=year]:checked]/board:text-inherit">
              <span aria-hidden="true">· </span>
              {monthsFree} {monthsFree === 1 ? "month" : "months"} free
            </span>
          )}
        </label>
      </div>
    </fieldset>
  );
}

function PlanColumn({ plan, index }: { plan: Plan; index: number }) {
  const free = plan.id === "free";
  const titleId = `plan-${plan.id}-title`;
  const yearlyPerMonth = Math.round(plan.yearlyPriceCents / 12);
  const cta = (interval: "month" | "year") =>
    free ? "/login" : publicCheckoutHref({ type: "plan", planId: plan.id as Exclude<PlanId, "free">, interval });
  // cn() lets the size's font-size win over the base one (cva alone keeps both classes).
  const ctaClass = cn(
    buttonVariants({ variant: plan.popular ? "brand" : "outline", size: "lg", className: "w-full rounded-[2px]" }),
  );
  const label = free ? "Start free" : `Get ${plan.name}`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative flex flex-col px-0 pt-6 pb-8 sm:px-6 lg:px-6",
        // Hairlines between columns: stacked on phones, 2×2 on tablets, one row on desktop.
        index > 0 && "border-t border-border",
        index === 1 && "sm:border-t-0",
        index % 2 === 1 && "sm:border-l",
        index > 1 && "lg:border-t-0",
        index > 0 && "lg:border-l",
        index % 2 === 0 && "sm:pl-0 lg:pl-6",
        index === 0 && "lg:pl-0",
        index === ORDER.length - 1 && "lg:pr-0",
      )}
    >
      {plan.popular && (
        // The board's pick: a safelight bar along the top of the column, like a marker on a price board.
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-[3px] bg-safelight sm:inset-x-6 lg:inset-x-6"
        />
      )}
      {/* Reserved row, so the plan names line up across the board. */}
      <p className="mono-caps h-3.5 text-safelight-ink">{plan.popular ? "Most popular" : null}</p>
      <h2 id={titleId} className="mt-3 font-display text-4xl leading-none tracking-[-0.01em]">
        {plan.name}
      </h2>
      <p className="mt-2 text-sm text-pretty text-muted-foreground lg:min-h-10">{plan.description}</p>

      <div className="mt-6 border-t border-border pt-5">
        <p className="flex items-baseline gap-2">
          <span className={cn("font-display text-6xl leading-none tabular-nums", !free && MONTHLY_ONLY)}>
            {formatPrice(plan.monthlyPriceCents)}
          </span>
          {!free && (
            <span className={cn("font-display text-6xl leading-none tabular-nums", YEARLY_ONLY)}>
              {formatPrice(yearlyPerMonth)}
            </span>
          )}
          <span className="mono-caps text-muted-foreground">/ month</span>
        </p>
        <p className="mt-2 min-h-8 font-mono text-xs leading-snug text-muted-foreground">
          {free ? (
            "No card needed"
          ) : (
            <>
              <span className={MONTHLY_ONLY}>{formatCredits(plan.monthlyCredits)} credits every month</span>
              <span className={YEARLY_ONLY}>
                {formatPrice(plan.yearlyPriceCents)} billed yearly · {formatCredits(plan.monthlyCredits * 12)} credits
                up front
              </span>
            </>
          )}
        </p>
      </div>

      <ul className="mt-5 flex flex-1 flex-col text-sm">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-3 border-b border-dotted border-border py-2 first:pt-0">
            <span aria-hidden="true" className="font-mono text-muted-foreground">
              +
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        {free ? (
          <Link href={cta("month")} className={ctaClass}>
            {label}
          </Link>
        ) : (
          <>
            <Link href={cta("month")} className={cn(ctaClass, MONTHLY_ONLY)}>
              {label}
            </Link>
            <Link href={cta("year")} className={cn(ctaClass, YEARLY_ONLY_FLEX)}>
              {label}
              <span className="sr-only"> (yearly)</span>
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

/** Every plan, side by side, with the billing-period switch. Paid plans continue to checkout after sign-in. */
export function PlanBoard({ className }: { className?: string }) {
  const plans = ORDER.map((id) => PLANS[id]);
  return (
    <div className={cn("group/board", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-foreground pt-3">
        <p className="mono-caps text-muted-foreground">
          <span className="text-foreground">No. 01</span>
          <span aria-hidden="true"> / </span>
          <span className="sr-only">: </span>
          Plans
        </p>
        <IntervalSwitch />
      </div>
      <div className="mt-4 grid border-b border-foreground sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => (
          <PlanColumn key={plan.id} plan={plan} index={i} />
        ))}
      </div>
    </div>
  );
}

/** One-time credit packs as a price list: name, dotted leader, price per credit, price, buy. */
export function CreditPackBoard({ className }: { className?: string }) {
  return (
    <ul className={cn("border-t border-foreground", className)}>
      {CREDIT_PACKS.map((pack) => (
        <li
          key={pack.id}
          className="flex flex-col gap-4 border-b border-border py-5 sm:flex-row sm:items-center sm:gap-10"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline">
              <h3 className="font-display text-3xl leading-none whitespace-nowrap sm:text-4xl">{pack.name}</h3>
              <Leader />
              <p className="font-display text-3xl leading-none tabular-nums sm:text-4xl">
                {formatPrice(pack.priceCents)}
              </p>
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {pack.popular && <span className="text-safelight-ink">Best value · </span>}
              {formatPerCredit(pack.priceCents, pack.credits)} per credit · {formatCredits(pack.credits)} credits that
              never expire
            </p>
          </div>
          <Link
            href={publicCheckoutHref({ type: "credit_pack", packId: pack.id })}
            className={cn(
              buttonVariants({ variant: pack.popular ? "brand" : "outline", className: "rounded-[2px] sm:w-44" }),
            )}
          >
            Buy {pack.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
