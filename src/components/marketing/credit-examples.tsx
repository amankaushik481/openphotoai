import { formatPrice } from "@/components/billing/format";
import { CREDIT_PACKS } from "@/config/plans";
import { creditExamples, formatCreditCost } from "@/content/credit-costs";

/**
 * "What 100 credits buy": the smallest credit pack expressed in photos, edits and videos (from CREDIT_COSTS),
 * set as a readout: big numerals over mono captions, between hairlines.
 */
export function CreditExamples() {
  const pack = CREDIT_PACKS.reduce((a, b) => (b.credits < a.credits ? b : a));
  const examples = creditExamples(pack.credits);
  return (
    <section aria-labelledby="credit-examples-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id="credit-examples-title" className="font-display text-3xl leading-tight">
          What {pack.credits.toLocaleString("en-US")} credits buy
        </h3>
        <p className="mono-caps text-muted-foreground">
          {formatPrice(pack.priceCents)} one-time pack · any one, or any mix · drafts free
        </p>
      </div>
      {/* 1px gaps over the hairline colour draw the rules between cells, whatever the column count. */}
      <ul className="mt-5 grid grid-cols-2 gap-px border-y border-foreground bg-border sm:grid-cols-3 lg:grid-cols-6">
        {examples.map((e, i) => (
          <li key={e.key} className="flex flex-col bg-background px-4 py-5">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mt-2 font-display text-5xl leading-none tabular-nums">
              {e.count.toLocaleString("en-US")}
            </span>
            <span className="mt-2 text-sm font-medium">{e.count === 1 ? e.label[0] : e.label[1]}</span>
            <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {formatCreditCost(e.credits)} each
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
