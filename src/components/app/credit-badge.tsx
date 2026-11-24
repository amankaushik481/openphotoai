"use client";

import Link from "next/link";
import { CoinsIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** Live credit balance (SWR /api/me); links to billing. */
export function CreditBadge({ className }: { className?: string }) {
  const { user, isLoading } = useMe();
  const t = useT();

  if (isLoading && !user) {
    return <Skeleton className={cn("h-8 w-20 rounded-full", className)} aria-hidden="true" />;
  }
  if (!user) return null;

  const label = t.count("credits.balance", "credits.balanceOne", user.credits);
  return (
    <Link
      href="/app/billing"
      aria-label={`${label} — ${t("credits.buy")}`}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium tabular-nums shadow-xs transition-colors hover:bg-accent",
        user.credits === 0 && "border-warning/50",
        className,
      )}
    >
      <CoinsIcon aria-hidden="true" className="size-4 text-primary" />
      {user.credits.toLocaleString(t.locale)}
    </Link>
  );
}
