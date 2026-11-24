"use client";

import * as React from "react";
import { ZapIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import {
  MAX_IMAGES_PER_JOB,
  modeMultiplier,
  perImageCredits,
  plural,
  type BatchQuality,
  type IdentityMode,
} from "@/components/create/logic";
import type { Quality } from "@/types/domain";
import { cn } from "@/lib/utils";

const segmentItem =
  "h-auto min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 whitespace-normal first:rounded-lg last:rounded-lg data-[variant=outline]:border-l";

interface QualityOption {
  value: Quality;
  title: string;
  detail: string;
  disabled?: boolean;
}

export interface QualityControlProps {
  value: Quality;
  onValueChange: (q: Quality) => void;
  mode?: IdentityMode;
  /** Omit the Draft option (e.g. batches, which are always full quality). */
  draftsLeft?: number;
  includeDraft?: boolean;
  className?: string;
}

function creditsPerPhoto(quality: Quality, mode: IdentityMode | undefined): string {
  const n = perImageCredits(quality) * modeMultiplier(mode);
  return `${n} ${plural(n, "credit")} / photo`;
}

/** Draft (free, capped daily) | Standard | High, with per-photo prices for the selected model. */
export function QualityControl({ value, onValueChange, mode, draftsLeft = 0, includeDraft = true, className }: QualityControlProps) {
  const labelId = React.useId();
  const hintId = React.useId();
  const options: QualityOption[] = [
    ...(includeDraft
      ? [
          {
            value: "draft" as const,
            title: "Draft",
            detail: draftsLeft > 0 ? `Free · ${draftsLeft} left today` : "None left today",
            disabled: draftsLeft <= 0,
          },
        ]
      : []),
    { value: "standard", title: "Standard", detail: creditsPerPhoto("standard", mode) },
    { value: "high", title: "High", detail: creditsPerPhoto("high", mode) },
  ];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>Quality</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        aria-labelledby={labelId}
        aria-describedby={includeDraft ? hintId : undefined}
        onValueChange={(next) => {
          if (next) onValueChange(next as Quality);
        }}
        className="flex w-full gap-2 shadow-none"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} className={segmentItem}>
            <span className="text-sm font-medium">{o.title}</span>
            <span className="text-[11px] leading-tight font-normal text-muted-foreground tabular-nums">{o.detail}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {includeDraft && (
        <p id={hintId} className="text-xs text-muted-foreground">
          Drafts are fast, free previews. Re-render the ones you love at full quality with one click.
        </p>
      )}
    </div>
  );
}

/** Standard | High for batches (drafts are single-shot previews). */
export function BatchQualityControl(props: {
  value: BatchQuality;
  onValueChange: (q: BatchQuality) => void;
  mode?: IdentityMode;
  className?: string;
}) {
  return (
    <QualityControl
      {...props}
      includeDraft={false}
      onValueChange={(q) => {
        if (q !== "draft") props.onValueChange(q);
      }}
    />
  );
}

export function CountPicker({
  value,
  onValueChange,
  max = MAX_IMAGES_PER_JOB,
  className,
}: {
  value: number;
  onValueChange: (n: number) => void;
  max?: number;
  className?: string;
}) {
  const labelId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>Number of photos</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(value)}
        aria-labelledby={labelId}
        onValueChange={(next) => {
          if (next) onValueChange(Number(next));
        }}
        className="flex w-full gap-2 shadow-none"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            aria-label={`${n} ${plural(n, "photo")}`}
            className={cn(segmentItem, "min-h-10 tabular-nums")}
          >
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Shown next to the model picker when the chosen model is an instant (reference-based) model. */
export function InstantModeBadge({ mode, className }: { mode: IdentityMode | undefined; className?: string }) {
  if (mode !== "instant") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="soft" tabIndex={0} className={cn("cursor-help", className)}>
          <ZapIcon aria-hidden="true" />
          Instant model · {INSTANT_MODE_MULTIPLIER}× credits
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-balance">
        Instant models need no training but run on a pricier reference-based model, so full-quality photos cost{" "}
        {INSTANT_MODE_MULTIPLIER}× credits. Drafts stay free. Train your model for the best likeness at the normal price.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Phone-only action bar pinned above the bottom navigation (which is ~3.75rem + safe area tall).
 * Render `<StickyActionBarSpacer />` at the end of the page so content can scroll clear of it.
 */
export function StickyActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("glass fixed inset-x-0 z-30 border-t border-border/70 px-4 py-2.5 md:hidden", className)}
      style={{ bottom: "calc(3.75rem + max(0.5rem, env(safe-area-inset-bottom)))" }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">{children}</div>
    </div>
  );
}

export function StickyActionBarSpacer() {
  return <div aria-hidden="true" className="h-16 md:hidden" />;
}
