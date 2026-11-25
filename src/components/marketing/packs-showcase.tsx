import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Folio, SHELL } from "@/components/marketing/editorial";
import { LIGHTING_LABEL, PortraitArt, type LightingSetup, type PortraitHair } from "@/components/marketing/portrait-art";
import { CREDIT_COSTS } from "@/config/credits";
import { cn } from "@/lib/utils";
import type { PackCategory, PackSummary } from "@/types/pack";

/** Featured packs first (registry order), then the rest, capped at `limit`. */
export function pickShowcasePacks(packs: readonly PackSummary[], limit = 8): PackSummary[] {
  return [...packs.filter((p) => p.featured), ...packs.filter((p) => !p.featured)].slice(0, limit);
}

/** How each kind of shoot is lit in the index's lighting studies. */
const LIGHT: Record<PackCategory, LightingSetup> = {
  professional: "loop",
  dating: "window",
  lifestyle: "window",
  travel: "high-key",
  fashion: "butterfly",
  fitness: "rim",
  events: "rembrandt",
  seasonal: "low-key",
  creative: "split",
  family: "high-key",
};
const HAIR: PortraitHair[] = ["short", "long", "bun", "curly", "crop"];

/**
 * Packs as an editorial index: a numbered table of contents set in the display serif, dotted leaders to
 * each pack's facts. On wide screens the print beside the list follows the row you point at (CSS only).
 */
export function PacksShowcase({ packs }: { packs: readonly PackSummary[] }) {
  const showcase = pickShowcasePacks(packs, 9);
  if (showcase.length === 0) return null;
  const styles = packs.reduce((n, p) => n + p.promptCount, 0);
  return (
    <section aria-labelledby="packs-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-6 lg:grid-cols-12 lg:gap-x-10")}>
        <Folio no="03" label="Index" className="lg:col-span-12" />
        <h2
          id="packs-title"
          className="font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em] lg:col-span-7"
        >
          Pick a shoot. <span className="italic">We&apos;ll handle the light.</span>
        </h2>
        <div className="flex flex-col items-start gap-5 lg:col-span-4 lg:col-start-9 lg:self-end lg:pb-2">
          <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
            {packs.length} curated packs, {styles.toLocaleString("en-US")} styles. Each pack is an open JSON file, and you
            can preview every one free with drafts.
          </p>
          <Link
            href="/packs"
            className="inline-flex items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink"
          >
            Browse all {packs.length} packs
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <div className={cn(SHELL, "mt-14 sm:mt-20")}>
        <ol className="pack-index relative border-t border-foreground lg:pr-[calc(33.333%+2.5rem)]">
          {showcase.map((pack, i) => {
            const setup = LIGHT[pack.category];
            const no = String(i + 1).padStart(2, "0");
            const credits = pack.promptCount * CREDIT_COSTS.generateStandard;
            return (
              <li key={pack.slug} className="group border-b border-border">
                <Link
                  href={`/packs/${pack.slug}`}
                  className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 py-4 sm:grid-cols-[3rem_1fr_auto] sm:py-5 lg:grid-cols-[3.5rem_auto_1fr_auto] lg:items-baseline"
                >
                  <span className="mono-caps text-muted-foreground transition-colors group-hover:text-safelight-ink lg:self-baseline">
                    {no}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[2rem] leading-none tracking-[-0.01em] sm:text-[2.75rem] lg:text-[3.25rem] lg:group-hover:italic">
                      {pack.name}
                    </span>
                    <span className="mono-caps mt-2 block text-[0.625rem] text-muted-foreground lg:hidden">
                      {pack.promptCount} styles · {credits} cr full set
                    </span>
                  </span>
                  {/* Dotted leader to the facts (wide screens). */}
                  <span
                    aria-hidden="true"
                    className="mx-3 hidden h-px self-center border-b-2 border-dotted border-foreground/30 transition-colors group-hover:border-safelight-ink lg:block"
                  />
                  <span className="mono-caps hidden text-muted-foreground lg:inline">
                    {pack.promptCount} styles · {credits} cr
                  </span>
                  {/* Phones: a small print at the end of the row. */}
                  <span
                    aria-hidden="true"
                    className="grain-over relative col-start-3 row-start-1 aspect-[4/5] w-14 overflow-hidden rounded-[1px] sm:w-16 lg:hidden"
                  >
                    <PortraitArt id={`idx-m-${pack.slug}`} setup={setup} hair={HAIR[i % HAIR.length]} x={i % 2 ? 6 : -6} />
                  </span>
                </Link>
                {/* Wide screens: the print for this row, shown while it is pointed at (the first by default). */}
                <figure
                  aria-hidden="true"
                  className="pack-preview pointer-events-none absolute top-0 right-0 hidden w-[33.333%] opacity-0 transition-opacity duration-300 lg:block"
                >
                  <div className="print-paper p-3 pb-10 shadow-print">
                    <div className="grain-over relative aspect-[4/5] overflow-hidden">
                      <PortraitArt id={`idx-${pack.slug}`} setup={setup} hair={HAIR[i % HAIR.length]} x={i % 2 ? 8 : -8} />
                    </div>
                    <figcaption className="mt-3 flex justify-between font-mono text-[0.625rem] tracking-[0.16em] text-[#16140f] uppercase">
                      <span>
                        {no} · {pack.name}
                      </span>
                      <span>{LIGHTING_LABEL[setup]}</span>
                    </figcaption>
                  </div>
                </figure>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
