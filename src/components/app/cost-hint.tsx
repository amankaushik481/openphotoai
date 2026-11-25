"use client";

import Link from "next/link";

import { creditCost } from "@/config/credits";
import { useMe } from "@/hooks/use-me";
import type { JobInput } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export interface CostHintProps {
  /** Job input to price with `creditCost()`. */
  input?: JobInput;
  /** Explicit cost (e.g. batches); overrides `input`. */
  credits?: number;
  /** Show the user's balance and an "insufficient" warning (default true). */
  showBalance?: boolean;
  /** `readout`: big meter digits ("4 CR") over the balance line, to sit next to a Generate button. */
  variant?: "line" | "readout";
  className?: string;
}

/** What an action costs, as a meter readout ("COSTS 40 CREDITS · YOU HAVE 288"); warns when the balance is too low. */
export function CostHint({ input, credits, showBalance = true, variant = "line", className }: CostHintProps) {
  const t = useT();
  const { user } = useMe();
  const cost = credits ?? (input ? creditCost(input) : 0);
  const balance = showBalance ? user?.credits : undefined;
  const short = balance !== undefined && cost > balance ? cost - balance : 0;
  const costText = cost === 0 ? t("credits.costFree") : t.count("credits.cost", "credits.costOne", cost);

  if (variant === "readout") {
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", className)}>
        <span aria-hidden="true" className="mono-caps text-muted-foreground">
          Cost
        </span>
        <span className="sr-only">{costText}</span>
        <span aria-hidden="true" className="flex items-baseline gap-1 font-mono leading-none tabular-nums">
          <span className="text-[1.75rem] font-medium tracking-[-0.03em]">{cost === 0 ? "Free" : cost.toLocaleString(t.locale)}</span>
          {cost > 0 && <span className="text-[0.6875rem] tracking-[0.14em] text-muted-foreground">CR</span>}
        </span>
        {balance !== undefined && (
          <span className="font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
            {t("credits.youHave", { count: balance.toLocaleString(t.locale) })}
          </span>
        )}
        {short > 0 && (
          <p className="text-sm text-destructive">
            {t("credits.insufficient", { needed: short })}{" "}
            <Link href="/app/billing" className="font-medium underline underline-offset-4">
              {t("credits.buy")}
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
        <span aria-hidden="true" className="size-1.5 self-center rounded-full bg-safelight-ink" />
        <span className="font-medium text-foreground">
          {cost === 0 ? t("credits.costFree") : t.count("credits.cost", "credits.costOne", cost)}
        </span>
        {balance !== undefined && (
          <span>· {t("credits.youHave", { count: balance.toLocaleString(t.locale) })}</span>
        )}
      </p>
      {short > 0 && (
        <p className="text-destructive">
          {t("credits.insufficient", { needed: short })}{" "}
          <Link href="/app/billing" className="font-medium underline underline-offset-4">
            {t("credits.buy")}
          </Link>
        </p>
      )}
    </div>
  );
}
