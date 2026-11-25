"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** At or below this balance the badge invites a top-up (a standard photo costs 1–2 credits). */
export const LOW_CREDITS = 5;

/**
 * Where the needle sits on the meter's log scale (0 → 1,000+ credits), 0..1. Purely a reading aid: the
 * number next to it is the balance.
 */
export function meterPosition(credits: number): number {
  return Math.min(1, Math.log10(Math.max(0, credits) + 1) / 3);
}

/**
 * Live credit balance (SWR /api/me) as a light-meter readout: mono digits with a "CR" unit, linking to
 * billing, with a safelight top-up cue when running low. `meter` adds the needle scale (sidebar).
 */
export function CreditBadge({ className, variant = "chip" }: { className?: string; variant?: "chip" | "meter" }) {
  const { user, isLoading } = useMe();
  const t = useT();

  if (isLoading && !user) {
    return (
      <Skeleton className={cn(variant === "meter" ? "h-[5.5rem] w-full" : "h-8 w-24", className)} aria-hidden="true" />
    );
  }
  if (!user) return null;

  const low = user.credits <= LOW_CREDITS;
  const label = t.count("credits.balance", "credits.balanceOne", user.credits);
  const amount = user.credits.toLocaleString(t.locale);

  if (variant === "meter") {
    const needle = meterPosition(user.credits);
    return (
      <Link
        href="/app/billing"
        aria-label={`${label} — ${t("credits.buy")}`}
        className={cn("group flex flex-col gap-2 rounded-xs py-1 [--focus-offset:4px]", className)}
      >
        <span aria-hidden="true" className="flex items-baseline justify-between mono-caps text-muted-foreground">
          <span>Light meter</span>
          <span className={cn(low && "text-safelight-ink")}>{low ? "Low" : "CR"}</span>
        </span>
        <span aria-hidden="true" className="flex items-baseline gap-2">
          <span className="font-mono text-[1.75rem] leading-none font-medium tracking-[-0.02em] tabular-nums">
            {amount}
          </span>
          <span className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">credits</span>
        </span>
        {/* Match-needle scale: 0 · 10 · 100 · 1K (log). */}
        <span aria-hidden="true" className="relative mt-1 block h-3">
          <span className="absolute inset-x-0 bottom-0 flex justify-between">
            {Array.from({ length: 13 }, (_, i) => (
              <span key={i} className={cn("w-px bg-foreground/35", i % 4 === 0 ? "h-2.5" : "h-1.5")} />
            ))}
          </span>
          <span
            className={cn(
              "absolute -bottom-0.5 h-3.5 w-0.5 -translate-x-1/2 transition-[left] duration-700",
              low ? "bg-safelight-ink" : "bg-foreground",
            )}
            style={{ left: `${needle * 100}%` }}
          />
        </span>
        <span aria-hidden="true" className="flex justify-between font-mono text-[0.5625rem] tracking-[0.1em] text-muted-foreground">
          <span>0</span>
          <span>10</span>
          <span>100</span>
          <span>1K</span>
        </span>
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground underline decoration-foreground/30 underline-offset-4 group-hover:decoration-safelight-ink">
          <PlusIcon aria-hidden="true" className="size-3.5" />
          {t("credits.buy")}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/app/billing"
      aria-label={`${label} — ${t("credits.buy")}`}
      className={cn(
        "relative inline-flex h-8 items-stretch overflow-hidden rounded-xs border border-foreground/25 bg-card/60 font-mono text-sm tabular-nums transition-colors hover:border-foreground/50 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 dark:bg-transparent",
        low && "border-safelight-ink/60",
        className,
      )}
    >
      <span aria-hidden="true" className="flex items-center gap-1.5 pr-2 pl-2.5">
        <span className="text-[0.625rem] tracking-[0.16em] text-muted-foreground">CR</span>
        <span className="font-medium">{amount}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center gap-1 border-l px-1.5 text-xs font-semibold",
          low ? "border-transparent bg-brand-gradient px-2 text-white" : "border-foreground/25 text-foreground",
        )}
      >
        <PlusIcon className="size-3.5" />
        {low && <span className="hidden font-sans sm:inline">{t("credits.buy")}</span>}
      </span>
    </Link>
  );
}
