import { ServerIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { APP } from "@/config/app";
import { creditPriceRangeCents, formatCents, formatCreditCost, providerCostExamples } from "@/content/credit-costs";
import { getLegalVariables } from "@/content/legal";

function usd(amount: number): string {
  return amount < 1 ? formatCents(amount * 100) : `$${amount.toFixed(2)}`;
}

/** "Where your money goes": what we pay AI providers per action vs. what a credit costs you. */
export function ProviderCostNote() {
  const range = creditPriceRangeCents();
  const examples = providerCostExamples();
  const { priceChangeNoticeDays } = getLegalVariables();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
        <h3 className="text-lg font-semibold">Where your money goes</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          A credit costs {formatCents(range.min)}–{formatCents(range.max)} depending on how you buy it. Here is what we
          typically pay the AI provider for the same work with the default models. The difference pays for storage,
          safety and likeness checks, automatic refunds, support and keeping the project going.
        </p>
        <div className="mt-5 overflow-hidden rounded-xl border">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Credits charged compared with typical AI provider cost</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th scope="col" className="px-3 py-2.5 sm:px-4 font-medium">
                  Action
                </th>
                <th scope="col" className="px-3 py-2.5 sm:px-4 text-right font-medium">
                  You pay
                </th>
                <th scope="col" className="px-3 py-2.5 sm:px-4 text-right font-medium">
                  Provider cost
                </th>
              </tr>
            </thead>
            <tbody>
              {examples.map((e) => (
                <tr key={e.label} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2.5 sm:px-4 font-medium">
                    {e.label}
                  </th>
                  <td className="px-3 py-2.5 sm:px-4 text-right font-mono whitespace-nowrap tabular-nums">
                    {formatCreditCost(e.credits)}
                  </td>
                  <td className="px-3 py-2.5 sm:px-4 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">
                    ≈ {usd(e.providerUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Provider costs are estimates for the default fal.ai models and change over time. We give at least{" "}
          {priceChangeNoticeDays} days&apos; notice before any price increase.
        </p>
      </div>
      <div className="flex flex-col rounded-2xl border border-dashed bg-muted/30 p-5 sm:p-8">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
          <ServerIcon aria-hidden="true" className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">Rather pay the providers directly?</h3>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">
          {APP.name} is MIT-licensed. Self-host it with your own fal.ai or Replicate keys and pay their list prices with
          zero markup. Same app, same safety checks, your server.
        </p>
        <a
          href={APP.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 text-sm font-medium underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:rounded-sm"
        >
          <GithubIcon className="size-4" />
          Get the source
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
