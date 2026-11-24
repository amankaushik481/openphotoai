import { INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { CREDIT_COST_GROUPS, creditCostRows, formatCreditCost } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

/** Full credit price list, generated from CREDIT_COSTS. */
export function CreditCostTable() {
  const rows = creditCostRows();
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Credit cost of every action</caption>
        <thead>
          <tr className="border-b bg-muted/50 text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium sm:px-6">
              Action
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium sm:px-6">
              Cost
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell sm:px-6">
              Charged
            </th>
          </tr>
        </thead>
        {CREDIT_COST_GROUPS.map((group) => (
          <tbody key={group.id} className="border-b last:border-0">
            <tr>
              <th
                scope="colgroup"
                colSpan={3}
                className="bg-muted/25 px-4 pt-4 pb-2 font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:px-6"
              >
                {group.title}
              </th>
            </tr>
            {rows
              .filter((r) => r.group === group.id)
              .map((r) => (
                <tr key={r.key} data-cost-key={r.key} className="border-t border-border/60 first:border-0">
                  <th scope="row" className="px-4 py-3 font-medium sm:px-6">
                    {r.label}
                    {r.note && <span className="block text-xs font-normal text-muted-foreground">{r.note}</span>}
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">{r.unit}</span>
                  </th>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums sm:px-6",
                      r.credits === 0 && "font-semibold text-success",
                    )}
                  >
                    {formatCreditCost(r.credits)}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell sm:px-6">{r.unit}</td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-6">
        Photos from Instant (untrained) models cost {INSTANT_MODE_MULTIPLIER}× because they run on a larger
        multi-reference model. Failed, canceled, blocked and below-likeness results are refunded automatically.
      </p>
    </div>
  );
}
