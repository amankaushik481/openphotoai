import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { PackSummary } from "@/types/pack";
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

/** Pack colors come from JSON files; only allow plain hex so nothing odd reaches inline CSS. */
export function packGradient(colors: PackSummary["colors"]): string {
  const [a, b] = colors && HEX.test(colors[0]) && HEX.test(colors[1]) ? colors : FALLBACK_COLORS;
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function PackCard({ pack, href, priority = false, className }: PackCardProps) {
  return (
    <Link
      href={href ?? `/packs/${pack.slug}`}
      className={cn(
        "group flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <div
        className="grain relative aspect-[4/5] overflow-hidden rounded-xl shadow-xs"
        style={pack.cover ? undefined : { backgroundImage: packGradient(pack.colors) }}
      >
        {pack.cover ? (
          <Image
            src={pack.cover}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
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
            {pack.isNew && <Badge className="bg-background/90 text-foreground">New</Badge>}
            {pack.featured && <Badge className="bg-background/90 text-foreground">Featured</Badge>}
          </div>
        )}
        <span className="absolute right-2 bottom-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {pack.promptCount} styles
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{pack.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pack.tagline}</p>
      </div>
    </Link>
  );
}
