"use client";

import Link from "next/link";
import { CoinsIcon, PlusIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** At or below this balance the badge invites a top-up (a standard photo costs 1–2 credits). */
export const LOW_CREDITS = 5;

/** Live credit balance (SWR /api/me); links to billing, with a visible top-up cue when running low. */
export function CreditBadge({ className }: { className?: string }) {
  const { user, isLoading } = useMe();
  const t = useT();

  if (isLoading && !user) {
    return <Skeleton className={cn("h-8 w-20 rounded-full", className)} aria-hidden="true" />;
  }
  if (!user) return null;

  const low = user.credits <= LOW_CREDITS;
  const label = t.count("credits.balance", "credits.balanceOne", user.credits);
  return (
    <Link
      href="/app/billing"
      aria-label={`${label} — ${t("credits.buy")}`}
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 rounded-full border bg-card pr-1 pl-3 text-sm font-medium tabular-nums shadow-xs transition-colors hover:bg-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
        low && "border-warning/50",
        className,
      )}
    >
      <CoinsIcon aria-hidden="true" className="size-4 text-primary" />
      {user.credits.toLocaleString(t.locale)}
      <span
        aria-hidden="true"
        className={cn(
          "ml-0.5 inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 text-xs font-semibold",
          low ? "bg-brand-gradient text-white" : "bg-brand-soft text-brand-soft-foreground",
        )}
      >
        <PlusIcon className="size-3.5" />
        {low && <span className="hidden sm:inline">{t("credits.buy")}</span>}
      </span>
    </Link>
  );
}
