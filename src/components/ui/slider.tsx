"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Accessible names per thumb (multi-thumb sliders), e.g. ["Minimum", "Maximum"]. */
  thumbLabels?: string[];
};

/**
 * The accessible name goes on the thumbs (they carry role="slider"): `aria-label` / `aria-labelledby`
 * given to the slider are forwarded to every thumb, `thumbLabels` names thumbs individually, and
 * unnamed sliders fall back to "Value".
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-none bg-foreground/15 data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-safelight-ink data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabels?.[index] ?? (ariaLabelledBy ? ariaLabel : (ariaLabel ?? "Value"))}
          aria-labelledby={thumbLabels?.[index] ? undefined : ariaLabelledBy}
          className="relative block h-4.5 w-2.5 shrink-0 rounded-[1px] border border-foreground bg-background ring-ring/40 transition-[color,box-shadow] hover:ring-4 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:size-5 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
