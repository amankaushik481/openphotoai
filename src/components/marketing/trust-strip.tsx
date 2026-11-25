import { SHELL } from "@/components/marketing/editorial";
import { TRAINING } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";
import { cn } from "@/lib/utils";

/**
 * Spec readout under the hero, set like a light meter's display: product facts as label/value pairs,
 * every number from config or the pack registry.
 */
export function TrustStrip({ packCount, styleCount }: { packCount: number; styleCount: number }) {
  const credit = (n: number) => (n === 0 ? "Free" : `${n} cr`);
  const items: [label: string, value: string][] = [
    ["Photos to train", `${TRAINING.minPhotos}–${TRAINING.maxPhotos}`],
    ["Instant model", "Seconds"],
    ["Photo packs", String(packCount)],
    ["Styles", styleCount.toLocaleString("en-US")],
    ["Photos from", credit(CREDIT_COSTS.generateStandard)],
    ["Drafts", credit(CREDIT_COSTS.generateDraft)],
    ["Adults only", `${TRAINING.minAge}+`],
    ["License", "MIT"],
  ];
  return (
    <section aria-label="At a glance" className="border-y border-border">
      <div className={SHELL}>
        {/* Meter scale: decorative ticks, the zero mark in safelight. */}
        <div aria-hidden="true" className="flex h-3 items-end justify-between overflow-hidden pt-px">
          {Array.from({ length: 49 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "w-px bg-foreground/30",
                i % 6 === 0 ? "h-3" : "h-1.5",
                i === 24 && "h-3 w-[2px] bg-safelight-ink",
              )}
            />
          ))}
        </div>
        {/* Hairlines between cells (and rows when it wraps) are the 1px gaps over the border colour. */}
        <dl className="-mx-4 grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-8">
          {items.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-2.5 bg-background px-4 py-5 lg:py-7">
              <dt className="mono-caps text-[0.625rem] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-[1.375rem] leading-none font-medium tracking-tight tabular-nums lg:text-[1.625rem]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
