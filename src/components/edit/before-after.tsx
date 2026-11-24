"use client";

import * as React from "react";
import { ChevronsLeftRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { percentFromPointer, sliderKeyValue } from "./geometry";

export interface BeforeAfterProps {
  beforeUrl: string;
  afterUrl: string;
  /** Natural size of the photos (sets the box's aspect ratio). */
  width?: number | null;
  height?: number | null;
  beforeLabel?: string;
  afterLabel?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Before/after comparison: the "before" photo is clipped to the left of a draggable divider. Drag anywhere
 * (mouse, pen or touch; vertical swipes still scroll the page) or focus the handle and use the arrow keys,
 * PageUp/PageDown, Home and End.
 */
export function BeforeAfter({
  beforeUrl,
  afterUrl,
  width,
  height,
  beforeLabel = "Before",
  afterLabel = "After",
  alt = "Photo",
  className,
  style,
}: BeforeAfterProps) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState(50);
  const dragging = React.useRef<number | null>(null);

  const moveTo = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) setPos(percentFromPointer(clientX, rect));
  };

  return (
    <div
      ref={boxRef}
      className={cn("relative isolate touch-pan-y overflow-hidden rounded-xl bg-muted select-none", className)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : "4 / 5", ...style }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragging.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current === e.pointerId) moveTo(e.clientX);
      }}
      onPointerUp={(e) => {
        if (dragging.current === e.pointerId) dragging.current = null;
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer */}
      <img src={afterUrl} alt={`${alt} (${afterLabel.toLowerCase()})`} draggable={false} className="absolute inset-0 size-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer */}
      <img
        src={beforeUrl}
        alt={`${alt} (${beforeLabel.toLowerCase()})`}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
        {afterLabel}
      </span>

      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" style={{ left: `${pos}%` }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${beforeLabel} and ${afterLabel.toLowerCase()} comparison`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% ${beforeLabel.toLowerCase()}`}
        onKeyDown={(e) => {
          const next = sliderKeyValue(e.key, pos, e.shiftKey);
          if (next === null) return;
          e.preventDefault();
          setPos(next);
        }}
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-black/45 text-white shadow-lg backdrop-blur-sm focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-hidden"
        style={{ left: `${pos}%` }}
      >
        <ChevronsLeftRightIcon aria-hidden="true" className="size-5" />
      </div>
    </div>
  );
}
