"use client";

import * as React from "react";
import Link from "next/link";
import { HeartIcon } from "lucide-react";

import type { MediaDTO } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { PencilCircle, PencilCross, PencilDot, captionDate, frameNumber, sprocketRow } from "./marks";

export interface ContactGridProps {
  media: readonly MediaDTO[];
  loading?: boolean;
  skeletonCount?: number;
  /** Link target per frame. */
  hrefFor: (media: MediaDTO) => string;
  selectable?: boolean;
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  onToggleFavorite?: (media: MediaDTO, next: boolean) => void;
  /** Include media hidden by the best-shots picker. */
  showHidden?: boolean;
  /** Rendered when there is nothing to show. */
  empty?: React.ReactNode;
  /** Frames loaded eagerly (above the fold). */
  priorityCount?: number;
}

const GRID = "grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 @md:grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5";

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The gallery as a light table of small prints: each frame has a thin paper border, an edge-print frame
 * number and a mono caption. Favorites carry a grease-pencil dot; in selection mode, marked frames are
 * circled in grease pencil, the way an editor marks a contact sheet. Frames are a uniform 4:5 proof crop;
 * the viewer shows the whole print.
 */
export function ContactGrid({
  media,
  loading = false,
  skeletonCount = 12,
  hrefFor,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onToggleFavorite,
  showHidden = false,
  empty,
  priorityCount = 6,
}: ContactGridProps) {
  const selected = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const visible = React.useMemo(() => (showHidden ? media : media.filter((m) => !m.hidden)), [media, showHidden]);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectionChange?.([...next]);
  };

  if (loading && media.length === 0) return <ContactGridSkeleton count={skeletonCount} />;
  if (visible.length === 0) return <>{empty ?? null}</>;

  return (
    <div className="@container">
      <ul className={GRID}>
        {visible.map((m, i) => (
          <li key={m.id} className="min-w-0">
            <ContactFrame
              media={m}
              index={i}
              href={hrefFor(m)}
              selectable={selectable}
              selected={selected.has(m.id)}
              onSelectedChange={(on) => toggle(m.id, on)}
              onToggleFavorite={onToggleFavorite}
              priority={i < priorityCount}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactFrame({
  media,
  index,
  href,
  selectable,
  selected,
  onSelectedChange,
  onToggleFavorite,
  priority,
}: {
  media: MediaDTO;
  index: number;
  href: string;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (on: boolean) => void;
  onToggleFavorite?: (media: MediaDTO, next: boolean) => void;
  priority: boolean;
}) {
  const t = useT();
  const day = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(media.createdAt));
  const alt = media.prompt
    ? media.prompt.slice(0, 140)
    : `${media.kind === "video" ? t("media.video") : t("media.openImage")}, ${day}`;
  const n = frameNumber(index);
  const likeness = media.scores?.likeness;
  const isVideo = media.kind === "video";

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer
    <img
      src={media.thumbUrl || media.url}
      alt={alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn("size-full object-cover", media.hidden && "opacity-70 grayscale-[0.4]")}
    />
  );

  // Inset focus outline: the window clips overflow.
  const layerClass = "absolute inset-0 block size-full [--focus-offset:-3px]";
  const layer = selectable ? (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${t("media.selectImage")}: ${alt}`}
      onClick={() => onSelectedChange(!selected)}
      className={cn(layerClass, "cursor-crosshair")}
    >
      {image}
    </button>
  ) : (
    <Link href={href} className={layerClass} aria-label={alt}>
      {image}
    </Link>
  );

  return (
    <div
      data-slot="contact-frame"
      data-selected={selected || undefined}
      className={cn(
        "@container group relative border border-foreground/10 bg-card p-1.5 pb-0 shadow-[0_1px_2px_-1px_rgb(22_20_15/0.18)] transition-transform duration-300 sm:p-2 sm:pb-0 dark:border-foreground/12 dark:shadow-none",
        !selectable && "pointer-fine:hover:-translate-y-0.5",
      )}
    >
      {/* The print window. Videos sit in a strip of film rebate with sprocket holes. */}
      <div className={cn("relative aspect-[4/5] overflow-hidden bg-muted", isVideo && "bg-darkroom")}>
        {layer}
        {isVideo && (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-darkroom" style={sprocketRow} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-darkroom" style={sprocketRow} />
          </>
        )}
        {(media.isDraft || media.hidden) && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 flex flex-wrap gap-1">
            {media.isDraft && (
              <span className="mono-caps bg-card/95 px-1.5 py-1 text-[10px] text-foreground">{t("media.draft")}</span>
            )}
            {media.hidden && (
              <span className="mono-caps bg-card/95 px-1.5 py-1 text-[10px] text-foreground">{t("media.hidden")}</span>
            )}
          </span>
        )}
      </div>

      {/* Caption on the bottom margin of the print. */}
      <div className="flex h-9 items-center gap-2 font-mono text-[10px] leading-none tracking-[0.12em] text-muted-foreground uppercase tabular-nums sm:text-[11px]">
        <span className="relative flex shrink-0 items-center gap-1 text-foreground">
          <span aria-hidden="true" className="text-safelight-ink">
            ▸
          </span>
          {n}
          {media.hidden && <PencilCross strokeWidth={1.6} className="absolute -inset-x-1 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]" />}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {isVideo ? (
            <>
              <span className="sr-only">{t("media.video")}, </span>
              <span aria-hidden="true">▶ </span>
              {media.durationSec != null ? formatDuration(media.durationSec) : "Video"}
            </>
          ) : (
            <>
              {captionDate(media.createdAt)}
              {likeness != null && <span className="hidden @[10.5rem]:inline"> · {Math.round(likeness * 100)}%</span>}
            </>
          )}
        </span>
        {selectable ? (
          <span
            aria-hidden="true"
            className={cn("shrink-0", selected ? "text-safelight-ink" : "text-muted-foreground/80")}
          >
            {selected ? "Marked" : "Mark"}
          </span>
        ) : (
          onToggleFavorite && (
            <button
              type="button"
              aria-pressed={media.isFavorite}
              // Fixed name; `aria-pressed` carries the state.
              aria-label={t("media.favorite")}
              title={media.isFavorite ? t("media.unfavorite") : t("media.favorite")}
              onClick={() => onToggleFavorite(media, !media.isFavorite)}
              className={cn(
                "relative -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
                !media.isFavorite &&
                  "pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100",
              )}
            >
              {media.isFavorite ? <PencilDot className="size-3.5" /> : <HeartIcon aria-hidden="true" className="size-3.5" />}
            </button>
          )
        )}
      </div>

      {selected && <PencilCircle variant={index} strokeWidth={3} className="absolute -inset-2.5 z-10 h-[calc(100%+1.25rem)] w-[calc(100%+1.25rem)]" />}
    </div>
  );
}

/**
 * Loading: an empty contact sheet, dashed frames waiting for prints. `row` shows exactly one row at every
 * column count (the "load more" placeholder).
 */
export function ContactGridSkeleton({ count = 12, row = false, offset = 0 }: { count?: number; row?: boolean; offset?: number }) {
  const rowClass = [undefined, undefined, "hidden @md:block", "hidden @3xl:block", "hidden @6xl:block"];
  const items = row ? rowClass.length : count;
  return (
    <div className="@container w-full" aria-busy="true">
      <ul aria-hidden="true" className={GRID}>
        {Array.from({ length: items }, (_, i) => (
          <li key={i} className={row ? rowClass[i] : undefined}>
            <div className="border border-dashed border-foreground/25 p-1.5 pb-0 sm:p-2 sm:pb-0">
              <div className="aspect-[4/5] animate-pulse bg-muted/70 motion-reduce:animate-none" />
              <div className="flex h-9 items-center font-mono text-[10px] tracking-[0.12em] text-muted-foreground sm:text-[11px]">
                ▸ {frameNumber(offset + i)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
