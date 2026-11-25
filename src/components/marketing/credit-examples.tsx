import { formatPrice } from "@/components/billing/format";
import { CREDIT_PACKS } from "@/config/plans";
import { creditExamples, formatCreditCost } from "@/content/credit-costs";

/** "What 100 credits buy": the smallest credit pack expressed in photos, edits and videos (from CREDIT_COSTS). */
export function CreditExamples() {
  const pack = CREDIT_PACKS.reduce((a, b) => (b.credits < a.credits ? b : a));
  const examples = creditExamples(pack.credits);
  return (
    <section aria-labelledby="credit-examples-title" className="rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
      <h3 id="credit-examples-title" className="text-lg font-semibold">
        What {pack.credits.toLocaleString("en-US")} credits buy
        <span className="font-normal text-muted-foreground"> ({formatPrice(pack.priceCents)} one-time pack)</span>
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">Any one of these, or any mix. Drafts are free.</p>
      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        {examples.map((e) => (
          <li key={e.key} className="flex flex-col">
            <span className="font-display text-4xl leading-none tabular-nums">{e.count.toLocaleString("en-US")}</span>
            <span className="mt-1.5 text-sm font-medium">{e.count === 1 ? e.label[0] : e.label[1]}</span>
            <span className="mt-0.5 font-mono text-xs text-muted-foreground">{formatCreditCost(e.credits)} each</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
