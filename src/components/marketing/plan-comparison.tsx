import { PLANS } from "@/config/plans";
import { COMPARISON_PLAN_IDS, planComparisonRows, type PlanCell } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

function Cell({ value }: { value: PlanCell }) {
  if (value === true) {
    return (
      <>
        <span aria-hidden="true" className="mx-auto mt-1.5 block size-2 rounded-full bg-foreground" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

/**
 * Plans side by side as a printed spec sheet, generated from PLANS (the same limits the server enforces).
 * A fixed-layout table with short cells, so all four plans fit on a 360 px phone without horizontal scrolling.
 */
export function PlanComparison() {
  const rows = planComparisonRows();
  const plans = COMPARISON_PLAN_IDS.map((id) => PLANS[id]);
  return (
    <div className="border-y-2 border-foreground">
      <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
        <caption className="sr-only">Plans compared feature by feature</caption>
        <colgroup>
          <col className="w-[36%] sm:w-[40%]" />
          {plans.map((p) => (
            <col key={p.id} className={cn(p.popular && "bg-foreground/[0.035] dark:bg-foreground/[0.05]")} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-foreground">
            <th scope="col" className="py-3 pr-2 font-normal sm:pr-6">
              <span className="mono-caps text-muted-foreground" aria-hidden="true">
                Spec
              </span>
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th scope="col" key={p.id} className="px-1 py-3 text-center align-bottom font-normal sm:px-3">
                <span className="mono-caps block text-[10px] text-foreground sm:text-[11px]">{p.name}</span>
                {p.popular && (
                  <span className="mt-1 block font-mono text-[9px] tracking-[0.12em] text-safelight-ink uppercase sm:text-[10px]">
                    Popular
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label} className="border-t border-border first:border-0">
              <th scope="row" className="py-3 pr-2 align-top font-medium break-words sm:pr-6">
                <span className="flex gap-3">
                  <span aria-hidden="true" className="hidden pt-px font-mono text-[11px] text-muted-foreground tabular-nums sm:inline">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {row.label}
                    {row.note && (
                      <span className="mt-0.5 block font-mono text-[10px] leading-snug font-normal text-muted-foreground sm:text-[11px]">
                        {row.note}
                      </span>
                    )}
                  </span>
                </span>
              </th>
              {plans.map((p) => (
                <td key={p.id} className="px-1 py-3 text-center align-top font-mono break-words sm:px-3">
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
