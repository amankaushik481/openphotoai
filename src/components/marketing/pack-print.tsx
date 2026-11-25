/**
 * Monochrome "prints" for the public pack pages: each pack is shown as a lighting study (never a photo of a
 * real person) whose setup follows the kind of shoot, with a stable sitter per pack so the same pack looks
 * the same on the index, its brief and in "related" lists. Server components, SVG only.
 */
import Link from "next/link";

import {
  LIGHTING_LABEL,
  packStudy as coverStudy,
  PortraitArt,
  type LightingSetup,
  type PortraitHair,
} from "@/components/marketing/portrait-art";
import { folio, Leader } from "@/components/marketing/print-page";
import { CREDIT_COSTS } from "@/config/credits";
import { cn } from "@/lib/utils";
import type { PackSummary } from "@/types/pack";

/** Studies cycled through a pack's contact sheet, starting from its own setup. */
const ROLL: LightingSetup[] = ["loop", "rembrandt", "window", "butterfly", "split", "rim", "high-key", "low-key"];

export interface Study {
  setup: LightingSetup;
  hair: PortraitHair;
  x: number;
  tilt: number;
  flip: boolean;
}

/**
 * The pack's cover study (frame 0: the same sitter and light as on the landing page's pack index) or the
 * `frame`-th study on its contact sheet (same sitter, the next setups on the roll, small shifts).
 */
export function packStudy(pack: Pick<PackSummary, "slug" | "category">, frame = 0): Study {
  const cover = coverStudy(pack);
  if (frame === 0) return { ...cover, tilt: 0 };
  const start = Math.max(0, ROLL.indexOf(cover.setup));
  return {
    setup: ROLL[(start + frame) % ROLL.length]!,
    hair: cover.hair,
    x: ((cover.x + frame * 7 + 8) % 17) - 8,
    tilt: (frame % 5) - 2,
    flip: frame % 2 === 1 ? !cover.flip : cover.flip,
  };
}

export function studyLabel(study: Study): string {
  return LIGHTING_LABEL[study.setup];
}

/** A study in a frame (no paper border): fills its parent, which sets the size and aspect ratio. */
export function StudyFrame({ id, study, className }: { id: string; study: Study; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grain-over relative block overflow-hidden bg-[#2a2620]", className)}>
      <PortraitArt id={id} setup={study.setup} hair={study.hair} x={study.x} tilt={study.tilt} flip={study.flip} />
    </span>
  );
}

/**
 * A small print on paper: the study with a white border and a mono caption, as if pulled from the
 * drying rack. Decorative (the pack name is always next to it as text).
 */
export function PackPrint({
  id,
  pack,
  caption,
  className,
}: {
  id: string;
  pack: Pick<PackSummary, "slug" | "category">;
  caption?: string;
  className?: string;
}) {
  const study = packStudy(pack);
  return (
    <span aria-hidden="true" className={cn("print-paper block p-[6%] pb-[4%] shadow-print", className)}>
      <StudyFrame id={id} study={study} className="aspect-[4/5]" />
      {caption && (
        <span className="mt-[5%] block truncate font-mono text-[0.5625rem] tracking-[0.14em] text-[#16140f] uppercase">
          {caption}
        </span>
      )}
    </span>
  );
}

/**
 * One line of the pack index: number, small print, name, dotted leader, the facts. Carries `data-slug` and
 * `data-category` for the index filter.
 */
export function PackIndexRow({ pack, no }: { pack: PackSummary; no: number }) {
  const fullSet = pack.promptCount * CREDIT_COSTS.generateStandard;
  return (
    <li data-slug={pack.slug} data-category={pack.category} className="border-b border-border">
      <Link
        href={`/packs/${pack.slug}`}
        className="group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 py-4 [--focus-offset:-2px] sm:grid-cols-[2.5rem_3.75rem_minmax(0,1fr)] sm:gap-x-5 sm:py-3.5"
      >
        <span
          aria-hidden="true"
          className="hidden self-start pt-1 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors group-hover:text-safelight-ink sm:block"
        >
          {folio(no)}
        </span>
        <PackPrint
          id={`pk-${pack.slug}`}
          pack={pack}
          className="w-14 transition-transform duration-300 group-hover:-rotate-2 motion-reduce:transition-none sm:w-[3.75rem]"
        />
        <span className="min-w-0">
          <span className="flex items-baseline">
            <span className="font-display text-[1.75rem] leading-none tracking-[-0.01em] group-hover:italic sm:text-4xl">
              {pack.name}
            </span>
            {pack.isNew && <span className="mono-caps ml-3 shrink-0 text-safelight-ink">New</span>}
            <Leader className="hidden transition-colors group-hover:border-safelight-ink/60 md:block" />
            <span className="mono-caps hidden shrink-0 text-muted-foreground md:inline">
              {pack.promptCount} styles · {fullSet} cr
            </span>
          </span>
          <span className="mt-1.5 block truncate text-sm text-muted-foreground">{pack.tagline}</span>
          <span className="mono-caps mt-1.5 block text-[10px] text-muted-foreground md:hidden">
            {pack.promptCount} styles · {fullSet} cr full set
          </span>
        </span>
      </Link>
    </li>
  );
}
