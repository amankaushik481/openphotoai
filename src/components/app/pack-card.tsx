import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { PackSummary } from "@/types/pack";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export interface PackCardProps {
  pack: PackSummary;
  /** Defaults to the public pack page `/packs/:slug`; use `/app/packs/:slug` inside the app. */
  href?: string;
  priority?: boolean;
  className?: string;
}

const FALLBACK_COLORS: [string, string] = ["#16140f", "#6b645a"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function safeColors(colors: PackSummary["colors"]): [string, string] {
  return colors && HEX.test(colors[0]) && HEX.test(colors[1]) ? colors : FALLBACK_COLORS;
}

/**
 * The pack's tile background (a `background-image` value). Darkroom: no colour gradients, so it's one flat
 * near-black tinted faintly with the pack's darker colour, like a print toned in the tray. White text on it
 * stays well above the contrast `packTextScrim` guarantees for the raw colours. Pack colours come from JSON
 * files; only plain hex reaches inline CSS.
 */
export function packGradient(colors: PackSummary["colors"]): string {
  const [a, b] = safeColors(colors);
  const darker = luminanceUnder(srgbChannels(a), 0) <= luminanceUnder(srgbChannels(b), 0) ? a : b;
  const tone = `color-mix(in oklab, ${darker} 11%, #13110e)`;
  return `linear-gradient(${tone}, ${tone})`;
}

function srgbChannels(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG relative luminance of an sRGB color (channels 0–1) darkened by a black overlay of `alpha`. */
function luminanceUnder(rgb: [number, number, number], alpha: number): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb.map((c) => lin(c * (1 - alpha))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Opacity of a black scrim that keeps white text at ≥ 5:1 (AA for small text, with margin for the film
 * grain) over both gradient stops; sRGB-interpolated mixes are never lighter than the lighter stop.
 * Dark packs keep their colors (minimum 0.15); light ones (cream, sky, sand…) get a deeper scrim.
 */
export function packTextScrim(colors: PackSummary["colors"]): number {
  const stops = safeColors(colors).map(srgbChannels);
  const whiteOn = (alpha: number) => Math.min(...stops.map((s) => 1.05 / (luminanceUnder(s, alpha) + 0.05)));
  let alpha = 0.15;
  while (alpha < 0.8 && whiteOn(alpha) < 5) alpha += 0.05;
  return Math.round(alpha * 100) / 100;
}

/**
 * A pack as a print on the table: a toned black-and-white frame (the pack's prop in monochrome, or its
 * cover) in a thin paper border, mono caption with the category and style count, the name in the serif.
 */
export function PackCard({ pack, href, priority = false, className }: PackCardProps) {
  return (
    <Link href={href ?? `/packs/${pack.slug}`} className={cn("group flex flex-col gap-2.5 rounded-xs", className)}>
      <div className="rounded-[1px] border border-foreground/12 bg-card p-1.5 pb-2 shadow-[0_14px_24px_-22px_rgb(0_0_0/0.55)] transition-transform duration-300 group-hover:-translate-y-0.5">
        <div
          className="grain relative aspect-[4/5] overflow-hidden bg-darkroom"
          style={pack.cover ? undefined : { backgroundImage: packGradient(pack.colors) }}
        >
          {pack.cover ? (
            // Static file and the image optimizer is off (next.config `images.unoptimized`): a plain <img>
            // renders the same as next/image `fill` without shipping its client component to every pack grid.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pack.cover}
              alt=""
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              className="absolute inset-0 size-full object-cover text-transparent grayscale transition-[filter] duration-500 group-hover:grayscale-0"
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-6xl opacity-90 contrast-125 grayscale transition-[filter,transform] duration-500 group-hover:scale-105 sm:text-7xl"
            >
              {pack.emoji ?? "📷"}
            </span>
          )}
          {/* Viewfinder corners. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-2.5">
            <span className="absolute top-0 left-0 size-3 border-t border-l border-white/40" />
            <span className="absolute top-0 right-0 size-3 border-t border-r border-white/40" />
            <span className="absolute bottom-0 left-0 size-3 border-b border-l border-white/40" />
            <span className="absolute right-0 bottom-0 size-3 border-r border-b border-white/40" />
          </span>
          {(pack.isNew || pack.featured) && (
            <div className="absolute top-2 left-2 flex gap-1">
              {pack.isNew && <Badge className="bg-background/90 text-foreground">{t("packs.new")}</Badge>}
              {pack.featured && <Badge className="bg-background/90 text-foreground">{t("packs.featured")}</Badge>}
            </div>
          )}
        </div>
        <p className="mt-1.5 flex justify-between gap-2 font-mono text-[0.5625rem] tracking-[0.16em] text-muted-foreground uppercase">
          <span aria-hidden="true" className="truncate">
            {pack.category}
          </span>
          <span className="shrink-0">{t("packs.styles", { count: pack.promptCount })}</span>
        </p>
      </div>
      <div className="flex flex-col gap-1 px-0.5">
        <h3 className="font-display text-[1.375rem] leading-[1.05] decoration-1 underline-offset-4 group-hover:underline">
          {pack.name}
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pack.tagline}</p>
      </div>
    </Link>
  );
}
