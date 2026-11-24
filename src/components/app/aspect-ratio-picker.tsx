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

/** Shape preview scaled into a 20×20 box. */
function RatioShape({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 18 / Math.max(w, h);
  return (
    <span aria-hidden="true" className="flex size-5 items-center justify-center">
      <span
        className="rounded-[3px] border-[1.5px] border-current"
        style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}
      />
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
      <Label id={labelId} className={cn(hideLabel && "sr-only")}>
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
            className="h-auto min-w-[4.25rem] flex-none flex-col gap-1 rounded-lg border px-3 py-2 first:rounded-lg last:rounded-lg data-[variant=outline]:border-l"
          >
            <RatioShape ratio={ratio} />
            <span className="text-xs tabular-nums">{ratio}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
