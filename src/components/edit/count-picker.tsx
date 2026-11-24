"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface CountPickerProps {
  value: number;
  onValueChange: (count: number) => void;
  options: readonly number[];
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** "How many images" segmented control. */
export function CountPicker({ value, onValueChange, options, label = "Images", disabled = false, className }: CountPickerProps) {
  const labelId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>{label}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(value)}
        onValueChange={(v) => v && onValueChange(Number(v))}
        aria-labelledby={labelId}
        disabled={disabled}
        className="w-full max-w-64"
      >
        {options.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} aria-label={n === 1 ? "1 image" : `${n} images`} className="tabular-nums">
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
