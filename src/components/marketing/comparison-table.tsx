import { Folio, SHELL } from "@/components/marketing/editorial";
import { APP } from "@/config/app";
import { getLegalVariables } from "@/content/legal";
import { cn } from "@/lib/utils";

/** Generic comparison: no competitor names or trademarks, only common industry practice. */
function rows(): { topic: string; us: string; typical: string }[] {
  const legal = getLegalVariables();
  return [
    { topic: "Credit-pack credits", us: "Never expire", typical: "Often expire monthly" },
    { topic: "Plan credits", us: "Never expire", typical: "Use them or lose them" },
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

/** "The fine print": a typeset ledger of how we handle what people complain about most. */
export function ComparisonTable() {
  const caption = `${APP.name} compared with typical AI photo apps`;
  return (
    <section aria-labelledby="compare-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-6 lg:grid-cols-12 lg:gap-x-10")}>
        <Folio no="06" label="Terms" className="lg:col-span-12" />
        <h2
          id="compare-title"
          className="font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em] lg:col-span-8"
        >
          The fine print, <span className="block italic">minus the fine print.</span>
        </h2>
        <p className="max-w-[30rem] text-lg leading-relaxed text-pretty text-muted-foreground lg:col-span-4 lg:self-end lg:pb-2">
          How we handle the things people complain about most with AI photo apps.
        </p>
      </div>

      <div className={cn(SHELL, "mt-14 sm:mt-20")}>
        {/* Phones: a stacked list (a reflowed table loses its header association). */}
        <ul className="border-t border-foreground sm:hidden" aria-label={caption}>
          {rows().map((row) => (
            <li key={row.topic} className="border-b border-border py-4">
              <h3 className="mono-caps text-[0.625rem] text-muted-foreground">{row.topic}</h3>
              <dl className="mt-2 grid gap-1">
                <div>
                  <dt className="sr-only">{APP.name}</dt>
                  <dd className="flex gap-2.5 font-medium">
                    <span aria-hidden="true" className="font-mono text-safelight-ink">
                      ✓
                    </span>
                    {row.us}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Typical AI photo apps</dt>
                  <dd className="flex gap-2.5 text-muted-foreground">
                    <span aria-hidden="true" className="font-mono">
                      —
                    </span>
                    {row.typical}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <table className="hidden w-full border-collapse text-left sm:table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-foreground">
              <th scope="col" className="w-[30%] pb-3 font-normal">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className="mono-caps pb-3 text-foreground">
                {APP.name}
              </th>
              <th scope="col" className="mono-caps pb-3 font-medium text-muted-foreground">
                Typical AI photo apps
              </th>
            </tr>
          </thead>
          <tbody>
            {rows().map((row) => (
              <tr key={row.topic} className="group border-b border-border">
                <th
                  scope="row"
                  className="py-4 pr-6 align-baseline font-display text-[1.375rem] leading-tight font-normal lg:text-[1.625rem]"
                >
                  {row.topic}
                </th>
                <td className="py-4 pr-6 align-baseline">
                  <span className="flex gap-3 font-medium">
                    <span aria-hidden="true" className="font-mono text-safelight-ink">
                      ✓
                    </span>
                    {row.us}
                  </span>
                </td>
                <td className="py-4 align-baseline text-muted-foreground">
                  <span className="flex gap-3">
                    <span aria-hidden="true" className="font-mono">
                      —
                    </span>
                    {row.typical}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mono-caps mt-6 leading-relaxed text-muted-foreground">
          “Typical” reflects common practices in the AI photo app market, not any specific company.
        </p>
      </div>
    </section>
  );
}
