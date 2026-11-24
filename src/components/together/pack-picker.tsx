"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";

import { packGradient } from "@/components/app/pack-card";
import type { PackSummary } from "@/types/pack";
import { cn } from "@/lib/utils";

export interface PackPickerProps {
  packs: readonly PackSummary[];
  value: string | null;
  onValueChange: (slug: string) => void;
  name: string;
  legend: string;
  className?: string;
}

/** Compact radio tiles for choosing a pack (emoji on the pack's gradient). */
export function PackPicker({ packs, value, onValueChange, name, legend, className }: PackPickerProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
        {packs.map((pack) => {
          const checked = value === pack.slug;
          return (
            <label
              key={pack.slug}
              className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors",
                "hover:bg-accent/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                checked && "border-primary ring-1 ring-primary",
              )}
            >
              <input
                type="radio"
                name={name}
                value={pack.slug}
                checked={checked}
                onChange={() => onValueChange(pack.slug)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="grain flex h-16 items-center justify-center text-3xl"
                style={{ backgroundImage: packGradient(pack.colors) }}
              >
                {pack.emoji ?? "📸"}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                <span className="truncate text-sm font-medium">{pack.name}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{pack.tagline}</span>
              </span>
              {checked && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <CheckIcon className="size-3.5" />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
