import { INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { CREDIT_COST_GROUPS, creditCostRows, formatCreditCost } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

/**
 * Full credit price list, generated from CREDIT_COSTS, set like a photo lab's price board: one short table
 * per group, mono figures, dotted leaders from each service to its price.
 */
export function CreditCostTable() {
  const rows = creditCostRows();
  const groups = CREDIT_COST_GROUPS.map((group, g) => ({ ...group, letter: String.fromCharCode(65 + g) }));
  const half = Math.ceil(groups.length / 2);
  // Two stacks (A, B | C, D…) so a short group doesn't leave a hole beside a long one.
  const stacks = [groups.slice(0, half), groups.slice(half)];
  return (
    <div>
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        {stacks.map((stack, s) => (
          <div key={s} className="flex flex-col gap-10">
            {stack.map((group) => (
              <table key={group.id} className="w-full border-collapse text-left text-sm">
                <caption className="mono-caps border-b border-foreground pb-2 text-left">
                  <span className="text-muted-foreground">{group.letter} · </span>
                  {group.title}
                </caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.group === group.id)
                    .map((r) => (
                      <tr key={r.key} data-cost-key={r.key} className="border-b border-border align-baseline">
                        <th scope="row" className="py-3 pr-0 font-normal">
                          <span className="flex items-baseline">
                            <span className="font-medium">{r.label}</span>
                            <span
                              aria-hidden="true"
                              className="mx-2 h-[0.7em] min-w-4 flex-1 border-b-2 border-dotted border-foreground/25"
                            />
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                            {r.unit}
                            {r.note && <> · {r.note}</>}
                          </span>
                        </th>
                        <td
                          className={cn(
                            "w-px py-3 pl-0 text-right font-mono whitespace-nowrap tabular-nums",
                            r.credits === 0 && "font-medium text-success",
                          )}
                        >
                          {formatCreditCost(r.credits)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-8 max-w-[68ch] font-mono text-xs leading-relaxed text-muted-foreground">
        Photos from Instant (untrained) models cost {INSTANT_MODE_MULTIPLIER}× because they run on a larger
        multi-reference model. Failed, canceled, blocked and below-likeness results are refunded automatically.
      </p>
    </div>
  );
}
