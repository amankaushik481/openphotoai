import { CheckIcon, MinusIcon } from "lucide-react";

import { PLANS } from "@/config/plans";
import { COMPARISON_PLAN_IDS, planComparisonRows, type PlanCell } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

function Cell({ value }: { value: PlanCell }) {
  if (value === true) {
    return (
      <>
        <CheckIcon aria-hidden="true" className="mx-auto size-4 text-success" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <MinusIcon aria-hidden="true" className="mx-auto size-4 text-muted-foreground/70" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="font-mono tabular-nums">{value}</span>;
}

/**
 * Plans side by side, generated from PLANS (the same limits the server enforces). A fixed-layout table
 * with short cells, so all four plans fit on a 360 px phone without horizontal scrolling.
 */
export function PlanComparison() {
  const rows = planComparisonRows();
  const plans = COMPARISON_PLAN_IDS.map((id) => PLANS[id]);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
        <caption className="sr-only">Plans compared feature by feature</caption>
        <colgroup>
          <col className="w-[34%] sm:w-[36%]" />
          {plans.map((p) => (
            <col key={p.id} className={cn(p.popular && "bg-brand-soft/40 dark:bg-brand-soft/25")} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-3 py-3 font-medium text-muted-foreground sm:px-6">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th scope="col" key={p.id} className="px-1 py-3 text-center font-semibold sm:px-3">
                {p.name}
                {p.popular && (
                  <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-brand-soft-foreground uppercase sm:text-[11px]">
                    Popular
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border/60 first:border-0">
              <th scope="row" className="px-3 py-3 align-top font-medium break-words sm:px-6">
                {row.label}
                {row.note && (
                  <span className="mt-0.5 block text-[11px] leading-snug font-normal text-muted-foreground sm:text-xs">
                    {row.note}
                  </span>
                )}
              </th>
              {plans.map((p) => (
                <td key={p.id} className="px-1 py-3 text-center align-top break-words sm:px-3">
                  <Cell value={row.values[p.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
