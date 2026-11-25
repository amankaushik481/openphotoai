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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
      <div>
        <h3 className="font-display text-3xl leading-tight">Where your money goes</h3>
        <p className="mt-3 max-w-[62ch] text-sm text-pretty text-muted-foreground">
          A credit costs {formatCents(range.min)}–{formatCents(range.max)} depending on how you buy it. Here is what we
          typically pay the AI provider for the same work with the default models. The difference pays for storage,
          safety and likeness checks, automatic refunds, support and keeping the project going.
        </p>
        <table className="mt-5 w-full border-collapse border-y border-foreground text-left text-sm">
          <caption className="sr-only">Credits charged compared with typical AI provider cost</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="mono-caps py-2.5 pr-3 font-medium text-muted-foreground">
                Action
              </th>
              <th scope="col" className="mono-caps px-3 py-2.5 text-right font-medium text-muted-foreground">
                You pay
              </th>
              <th scope="col" className="mono-caps py-2.5 pl-3 text-right font-medium text-muted-foreground">
                Provider cost
              </th>
            </tr>
          </thead>
          <tbody>
            {examples.map((e) => (
              <tr key={e.label} className="border-b border-border last:border-0">
                <th scope="row" className="py-2.5 pr-3 font-medium">
                  {e.label}
                </th>
                <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap tabular-nums">
                  {formatCreditCost(e.credits)}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">
                  ≈ {usd(e.providerUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          Provider costs are estimates for the default fal.ai models and change over time. We give at least{" "}
          {priceChangeNoticeDays} days&apos; notice before any price increase.
        </p>
      </div>

      {/* A lab ticket: the self-host option, with the licence stamped on it. */}
      <div className="relative flex flex-col self-start border border-dashed border-foreground/40 p-6 sm:p-8">
        <p className="mono-caps flex items-center justify-between gap-3 text-muted-foreground">
          <span>Self-host ticket</span>
          <span
            aria-hidden="true"
            className="-rotate-6 rounded-[2px] border-2 border-safelight-ink px-2 py-0.5 text-safelight-ink"
          >
            MIT
          </span>
        </p>
        <h3 className="mt-4 font-display text-3xl leading-tight">Rather pay the providers directly?</h3>
        <p className="mt-3 text-sm text-pretty text-muted-foreground">
          {APP.name} is MIT-licensed. Self-host it with your own fal.ai or Replicate keys and pay their list prices with
          zero markup. Same app, same safety checks, your server.
        </p>
        <a
          href={APP.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 self-start text-sm font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm"
        >
          <GithubIcon className="size-4" />
          Get the source
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
