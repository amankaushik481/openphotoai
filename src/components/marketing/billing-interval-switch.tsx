"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type BillingInterval = "monthly" | "yearly";

/**
 * Tiny client island: a Monthly/Yearly toggle that swaps between two server-rendered trees.
 * Both trees come pre-rendered from the server, so the only client JS is this toggle.
 */
export function BillingIntervalSwitch({
  monthly,
  yearly,
  yearlyNote,
  defaultInterval = "monthly",
}: {
  monthly: React.ReactNode;
  yearly: React.ReactNode;
  /** e.g. "2 months free". */
  yearlyNote?: string;
  defaultInterval?: BillingInterval;
}) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>(defaultInterval);
  const options: { value: BillingInterval; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div
        role="group"
        aria-label="Billing period"
        className="mx-auto inline-flex items-center rounded-full border bg-muted/60 p-1 shadow-xs"
      >
        {options.map((o) => {
          const active = interval === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => setBillingInterval(o.value)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
              {o.value === "yearly" && yearlyNote && (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-soft-foreground">
                  {yearlyNote}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{interval === "monthly" ? monthly : yearly}</div>
    </div>
  );
}
