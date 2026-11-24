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

const FALLBACK_COLORS: [string, string] = ["#dc4320", "#7c33dc"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function safeColors(colors: PackSummary["colors"]): [string, string] {
  return colors && HEX.test(colors[0]) && HEX.test(colors[1]) ? colors : FALLBACK_COLORS;
}

/** Pack colors come from JSON files; only allow plain hex so nothing odd reaches inline CSS. */
export function packGradient(colors: PackSummary["colors"]): string {
  const [a, b] = safeColors(colors);
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
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

export function PackCard({ pack, href, priority = false, className }: PackCardProps) {
  return (
    <Link
      href={href ?? `/packs/${pack.slug}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl",
        className,
      )}
    >
      <div
        className="grain relative aspect-[4/5] overflow-hidden rounded-xl shadow-xs"
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
            className="absolute inset-0 size-full object-cover text-transparent transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-6xl drop-shadow-sm transition-transform duration-500 group-hover:scale-110 sm:text-7xl"
          >
            {pack.emoji ?? "📸"}
          </span>
        )}
        {(pack.isNew || pack.featured) && (
          <div className="absolute top-2 left-2 flex gap-1">
            {pack.isNew && <Badge className="bg-background/90 text-foreground">{t("packs.new")}</Badge>}
            {pack.featured && <Badge className="bg-background/90 text-foreground">{t("packs.featured")}</Badge>}
          </div>
        )}
        <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {t("packs.styles", { count: pack.promptCount })}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{pack.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pack.tagline}</p>
      </div>
    </Link>
  );
}
