"use client";

import * as React from "react";
import { EyeOffIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MediaCard } from "@/components/app/media-card";
import { MASONRY_UNITS, masonryRowSpan } from "@/components/app/media-layout";
import type { MediaDTO } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export interface MediaGridProps {
  media: readonly MediaDTO[];
  loading?: boolean;
  skeletonCount?: number;
  /** Link target per tile; default `/app/gallery/:id`. Return undefined for no link. */
  hrefFor?: (media: MediaDTO) => string | undefined;
  onOpen?: (media: MediaDTO) => void;
  selectable?: boolean;
  selectedIds?: ReadonlySet<string> | readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  onToggleFavorite?: (media: MediaDTO, next: boolean) => void;
  renderActions?: (media: MediaDTO) => React.ReactNode;
  /** Include media hidden by the best-shots picker (default false). */
  showHidden?: boolean;
  /** When provided and some media are hidden, renders a "Show hidden" switch above the grid. */
  onShowHiddenChange?: (show: boolean) => void;
  /** Rendered when there is nothing to show. */
  empty?: React.ReactNode;
  /** Number of tiles to load eagerly. */
  priorityCount?: number;
  className?: string;
}

const defaultHref = (m: MediaDTO) => `/app/gallery/${m.id}`;

// Rows are a quarter of a column width, so a tile's row span tracks its aspect ratio
// (container query units keep this pure CSS — no resize observers).
const gridStyle: React.CSSProperties = {
  gridAutoRows: `calc((100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols) / ${MASONRY_UNITS})`,
};
const gridClass =
  "grid grid-flow-row-dense grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-(--gap) [--cols:2] [--gap:0.5rem] sm:[--gap:0.75rem] @md:[--cols:3] @3xl:[--cols:4] @6xl:[--cols:5]";

export function MediaGrid({
  media,
  loading = false,
  skeletonCount = 8,
  hrefFor = defaultHref,
  onOpen,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onToggleFavorite,
  renderActions,
  showHidden = false,
  onShowHiddenChange,
  empty,
  priorityCount = 4,
  className,
}: MediaGridProps) {
  const t = useT();
  const switchId = React.useId();
  const selected = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const hiddenCount = React.useMemo(() => media.filter((m) => m.hidden).length, [media]);
  const visible = React.useMemo(() => (showHidden ? media : media.filter((m) => !m.hidden)), [media, showHidden]);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectionChange?.([...next]);
  };

  const hiddenBar = onShowHiddenChange && hiddenCount > 0 && (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xs border border-foreground/15 bg-card px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
        {t("media.hiddenCount", { count: hiddenCount })}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Label htmlFor={switchId}>{t("media.showHidden")}</Label>
        <Switch id={switchId} checked={showHidden} onCheckedChange={onShowHiddenChange} />
      </span>
    </div>
  );

  if (loading && media.length === 0) {
    return (
      <div className={cn("@container", className)} aria-busy="true">
        <ul className={gridClass} style={gridStyle}>
          {Array.from({ length: skeletonCount }, (_, i) => (
            <li key={i} style={{ gridRowEnd: `span ${[5, 4, 6, 5, 4, 5, 6, 4][i % 8]}` }}>
              <Skeleton className="size-full rounded-[1px]" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className={className}>
        {hiddenBar}
        {empty ?? null}
      </div>
    );
  }

  return (
    <div className={cn("@container", className)}>
      {hiddenBar}
      <ul className={gridClass} style={gridStyle}>
        {visible.map((m, i) => (
          <li key={m.id} style={{ gridRowEnd: `span ${masonryRowSpan(m.width, m.height)}` }} className="min-h-0">
            <MediaCard
              media={m}
              href={onOpen ? undefined : hrefFor(m)}
              onOpen={onOpen}
              selectable={selectable}
              selected={selected.has(m.id)}
              onSelectedChange={(on) => toggle(m.id, on)}
              onToggleFavorite={onToggleFavorite}
              actions={renderActions?.(m)}
              priority={i < priorityCount}
              className="h-full"
              style={{ aspectRatio: "auto" }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
