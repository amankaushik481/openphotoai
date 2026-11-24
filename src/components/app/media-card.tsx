"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, EyeOffIcon, HeartIcon, PlayIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { MediaDTO } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export interface MediaCardProps {
  media: MediaDTO;
  /** Link target when not in selection mode (e.g. `/app/gallery/${id}`). */
  href?: string;
  /** Click handler when not in selection mode and no href (e.g. open a lightbox). */
  onOpen?: (media: MediaDTO) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onToggleFavorite?: (media: MediaDTO, next: boolean) => void;
  /** Hover/focus action buttons (always visible on touch screens). */
  actions?: React.ReactNode;
  /** Load eagerly (above-the-fold tiles). */
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MediaCard({
  media,
  href,
  onOpen,
  selectable = false,
  selected = false,
  onSelectedChange,
  onToggleFavorite,
  actions,
  priority = false,
  className,
  style,
}: MediaCardProps) {
  const t = useT();
  const aspectRatio = media.width && media.height ? `${media.width} / ${media.height}` : "4 / 5";
  const alt = media.prompt ? media.prompt.slice(0, 140) : media.kind === "video" ? t("media.video") : t("media.openImage");

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
      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
    />
  );

  const layerClass =
    "absolute inset-0 block size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset";

  let layer: React.ReactNode;
  if (selectable) {
    layer = (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${t("media.selectImage")}: ${alt}`}
        onClick={() => onSelectedChange?.(!selected)}
        className={layerClass}
      >
        {image}
      </button>
    );
  } else if (href) {
    layer = (
      <Link href={href} className={layerClass} aria-label={alt}>
        {image}
      </Link>
    );
  } else if (onOpen) {
    layer = (
      <button type="button" onClick={() => onOpen(media)} className={layerClass} aria-label={alt}>
        {image}
      </button>
    );
  } else {
    layer = <div className="absolute inset-0">{image}</div>;
  }

  return (
    <div
      data-slot="media-card"
      data-selected={selected || undefined}
      className={cn(
        "group relative isolate overflow-hidden rounded-lg bg-muted shadow-xs",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
      style={{ aspectRatio, ...style }}
    >
      {layer}

      {media.kind === "video" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon aria-hidden="true" className="size-4 translate-x-px fill-current" />
          </span>
          {media.durationSec != null && (
            <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {formatDuration(media.durationSec)}
            </span>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
        {selectable && (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2 border-white shadow transition-colors",
              selected ? "bg-primary text-primary-foreground" : "bg-black/25",
            )}
          >
            {selected && <CheckIcon className="size-3.5" />}
          </span>
        )}
        {media.isDraft && (
          <Badge variant="secondary" className="bg-background/85 backdrop-blur-sm">
            {t("media.draft")}
          </Badge>
        )}
        {media.hidden && (
          <Badge variant="secondary" className="bg-background/85 backdrop-blur-sm">
            <EyeOffIcon aria-hidden="true" />
            {t("media.hidden")}
          </Badge>
        )}
      </div>

      {onToggleFavorite && !selectable && (
        <button
          type="button"
          aria-pressed={media.isFavorite}
          aria-label={media.isFavorite ? t("media.unfavorite") : t("media.favorite")}
          onClick={() => onToggleFavorite(media, !media.isFavorite)}
          className={cn(
            "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity outline-none hover:bg-black/55 focus-visible:ring-[3px] focus-visible:ring-white/70",
            !media.isFavorite &&
              "pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100",
          )}
        >
          <HeartIcon aria-hidden="true" className={cn("size-4", media.isFavorite && "fill-current text-rose-400")} />
        </button>
      )}

      {actions && !selectable && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/55 to-transparent p-2 pt-8 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
