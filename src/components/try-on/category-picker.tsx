"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_OPTIONS, type TryOnCategory } from "@/components/try-on/types";
import { cn } from "@/lib/utils";

export interface CategoryPickerProps {
  value: TryOnCategory;
  onValueChange: (value: TryOnCategory) => void;
  disabled?: boolean;
  className?: string;
}

/** Which part of the outfit the garment replaces. */
export function CategoryPicker({ value, onValueChange, disabled = false, className }: CategoryPickerProps) {
  const labelId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>Garment type</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        disabled={disabled}
        aria-labelledby={labelId}
        onValueChange={(next) => {
          // Radix allows deselecting in single mode; keep a category selected.
          if (next) onValueChange(next as TryOnCategory);
        }}
        className="grid w-full grid-cols-2 gap-2 shadow-none sm:grid-cols-4"
      >
        {CATEGORY_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.label}: ${option.hint}`}
            className="h-auto flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left whitespace-normal first:rounded-lg last:rounded-lg data-[variant=outline]:border-l"
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
