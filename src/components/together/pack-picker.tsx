"use client";

import * as React from "react";

import type { PackSummary } from "@/types/pack";
import { cn } from "@/lib/utils";
import { PencilCircle } from "@/components/gallery/marks";

export interface PackPickerProps {
  packs: readonly PackSummary[];
  value: string | null;
  onValueChange: (slug: string) => void;
  name: string;
  legend: string;
  className?: string;
}

/** Compact radio tiles for choosing a pack: a monochrome frame with its number, the name in a caption. */
export function PackPicker({ packs, value, onValueChange, name, legend, className }: PackPickerProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
        {packs.map((pack, i) => {
          const checked = value === pack.slug;
          return (
            <label
              key={pack.slug}
              className={cn(
                "group relative flex cursor-pointer flex-col border border-foreground/15 bg-card p-1 text-left transition-colors",
                "hover:bg-accent/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                checked && "border-safelight-ink",
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
              <span aria-hidden="true" className="relative flex h-16 items-center justify-center bg-darkroom text-3xl grayscale">
                {pack.emoji ?? "📷"}
                <span className="absolute bottom-1 left-1.5 font-mono text-[9px] tracking-[0.12em] text-darkroom-muted">
                  ▸ {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                <span className="truncate text-sm font-medium">{pack.name}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{pack.tagline}</span>
              </span>
              {checked && (
                <PencilCircle variant={i} strokeWidth={2.4} className="absolute -inset-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.75rem)]" />
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
