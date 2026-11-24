import { CheckIcon, MinusIcon } from "lucide-react";

import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { APP } from "@/config/app";
import { getLegalVariables } from "@/content/legal";

/** Generic comparison: no competitor names or trademarks, only common industry practice. */
function rows(): { topic: string; us: string; typical: string }[] {
  const legal = getLegalVariables();
  return [
    { topic: "Credit-pack credits", us: "Never expire", typical: "Often expire monthly" },
    {
      topic: "Plan credits",
      us: "Never expire",
      typical: "Use them or lose them",
    },
    { topic: "Photo doesn't look like you", us: "Credits refunded automatically", typical: "Usually no refund" },
    { topic: "Failed or blocked results", us: "Refunded automatically", typical: "Often still charged" },
    {
      topic: "Refund of an unused purchase",
      us: `Within ${legal.refundWindowDays} days, even after downloading`,
      typical: "Often void once you download",
    },
    { topic: "Likeness quality", us: "Same on every plan", typical: "Often better on pricier tiers" },
    { topic: "Cost of each action", us: "Shown before you click", typical: "Often unclear until after" },
    { topic: "Consent check", us: "Live selfie + face match on every photo", typical: "Often just a checkbox" },
    { topic: "Self-hosting", us: "Docker Compose, your keys, zero markup", typical: "Not possible" },
    { topic: "Pack format", us: "Open JSON: write and share your own", typical: "Closed" },
    { topic: "Source code", us: "MIT-licensed", typical: "Proprietary" },
  ];
}

export function ComparisonTable() {
  return (
    <MarketingSection labelledBy="compare-title">
      <SectionHeading
        id="compare-title"
        eyebrow="Honest by design"
        title="The fine print, minus the fine print."
        lead="How we handle the things people complain about most with AI photo apps."
      />
      {/* Phones: a stacked list (a reflowed table loses its header association). */}
      <ul className="mt-12 flex flex-col gap-3 sm:hidden" aria-label={`${APP.name} compared with typical AI photo apps`}>
        {rows().map((row) => (
          <li key={row.topic} className="rounded-2xl border bg-card p-4 shadow-xs">
            <h3 className="text-sm font-medium">{row.topic}</h3>
            <dl className="mt-2 grid gap-2 text-sm">
              <div>
                <dt className="sr-only">{APP.name}</dt>
                <dd className="flex items-start gap-2">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {row.us}
                </dd>
              </div>
              <div className="text-muted-foreground">
                <dt className="sr-only">Typical AI photo apps</dt>
                <dd className="flex items-start gap-2">
                  <MinusIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {row.typical}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="mt-12 hidden overflow-hidden rounded-2xl border bg-card shadow-xs sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{APP.name} compared with typical AI photo apps</caption>
          <thead>
            <tr className="border-b bg-muted/50">
              <th scope="col" className="w-[34%] px-4 py-3.5 font-medium text-muted-foreground sm:px-6">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className="px-4 py-3.5 font-semibold sm:px-6">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-2 rounded-full bg-brand-gradient" />
                  {APP.name}
                </span>
              </th>
              <th scope="col" className="px-4 py-3.5 font-medium text-muted-foreground sm:px-6">
                Typical AI photo apps
              </th>
            </tr>
          </thead>
          <tbody>
            {rows().map((row) => (
              <tr key={row.topic} className="border-b last:border-0">
                <th scope="row" className="px-4 py-4 align-top font-medium sm:px-6">
                  {row.topic}
                </th>
                <td className="px-4 py-4 align-top sm:px-6">
                  <span className="flex items-start gap-2">
                    <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                    {row.us}
                  </span>
                </td>
                <td className="px-4 py-4 align-top text-muted-foreground sm:px-6">
                  <span className="flex items-start gap-2">
                    <MinusIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {row.typical}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        “Typical” reflects common practices in the AI photo app market, not any specific company.
      </p>
    </MarketingSection>
  );
}
