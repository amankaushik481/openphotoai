"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ASPECT_RATIOS, type AspectRatio } from "@/types/domain";
import type { TranslationKey } from "@/i18n";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export interface AspectRatioPickerProps {
  value: AspectRatio;
  onValueChange: (ratio: AspectRatio) => void;
  options?: readonly AspectRatio[];
  label?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

const NAMES: Partial<Record<AspectRatio, TranslationKey>> = {
  "1:1": "create.ratios.square",
  "4:5": "create.ratios.portrait",
  "9:16": "create.ratios.story",
  "16:9": "create.ratios.wide",
};

/**
 * The frame itself, drawn to its real proportions in a 32×32 box: a hairline outline with tiny crop
 * marks; the selected one is exposed (safelight outline over a faint safelight fill).
 */
function RatioShape({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 30 / Math.max(w, h);
  return (
    <span aria-hidden="true" className="flex size-8 items-center justify-center">
      <span
        className="relative rounded-[1px] border border-foreground/45 transition-colors group-data-[state=on]:border-[1.5px] group-data-[state=on]:border-safelight-ink group-data-[state=on]:bg-safelight/10"
        style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}
      >
        <span className="absolute -top-1 -left-1 size-1.5 border-t border-l border-foreground/50" />
        <span className="absolute -right-1 -bottom-1 size-1.5 border-r border-b border-foreground/50" />
      </span>
    </span>
  );
}

export function AspectRatioPicker({
  value,
  onValueChange,
  options = ASPECT_RATIOS,
  label,
  hideLabel = false,
  disabled = false,
  className,
}: AspectRatioPickerProps) {
  const t = useT();
  const labelId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label
        id={labelId}
        className={cn("font-mono text-[0.6875rem] tracking-[0.16em] text-muted-foreground uppercase", hideLabel && "sr-only")}
      >
        {label ?? t("create.aspectRatio")}
      </Label>
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        disabled={disabled}
        aria-labelledby={labelId}
        onValueChange={(next) => {
          // Radix allows deselecting in single mode; keep a ratio selected.
          if (next) onValueChange(next as AspectRatio);
        }}
        className="flex w-full flex-wrap gap-2 shadow-none"
      >
        {options.map((ratio) => (
          <ToggleGroupItem
            key={ratio}
            value={ratio}
            aria-label={NAMES[ratio] ? `${ratio} ${t(NAMES[ratio])}` : ratio}
            className="group h-auto min-h-11 min-w-[3.75rem] flex-none flex-col gap-1.5 rounded-xs border-transparent px-2.5 py-2 first:rounded-xs last:rounded-xs data-[state=on]:border-transparent data-[state=on]:shadow-none data-[variant=outline]:border-l hover:bg-foreground/[0.04]"
          >
            <RatioShape ratio={ratio} />
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] tabular-nums group-data-[state=on]:text-safelight-ink">
              {ratio}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
