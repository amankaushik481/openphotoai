"use client";

import * as React from "react";
import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { FilmIcon, HeartIcon, ImagesIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/app/empty-state";
import { MediaCard } from "@/components/app/media-card";
import { fetcher } from "@/lib/api-client";
import type { MediaDTO, MediaKind } from "@/types/domain";

/** Page size requested from GET /api/media. */
export const MEDIA_PICKER_PAGE_SIZE = 60;

export interface MediaPage {
  media: MediaDTO[];
  nextCursor: string | null;
}

export interface MediaPickerQuery {
  kind: MediaKind;
  favoritesOnly: boolean;
  cursor?: string | null;
  limit?: number;
}

/** `GET /api/media` URL for one page of the picker. */
export function mediaPickerUrl({ kind, favoritesOnly, cursor, limit = MEDIA_PICKER_PAGE_SIZE }: MediaPickerQuery): string {
  const params = new URLSearchParams({ kind, limit: String(limit) });
  if (favoritesOnly) params.set("favorite", "true");
  if (cursor) params.set("cursor", cursor);
  return `/api/media?${params.toString()}`;
}

/**
 * SWR-infinite key getter: page 0 has no cursor, later pages follow `nextCursor`, and paging stops
 * (null key) once a page has no cursor. Returns null while the picker is closed so nothing is fetched.
 */
export function mediaPickerKey(
  query: Omit<MediaPickerQuery, "cursor">,
  enabled: boolean,
): (pageIndex: number, previous: MediaPage | null) => string | null {
  return (pageIndex, previous) => {
    if (!enabled) return null;
    if (pageIndex === 0) return mediaPickerUrl(query);
    if (!previous?.nextCursor) return null;
    return mediaPickerUrl({ ...query, cursor: previous.nextCursor });
  };
}

/** Flatten loaded pages, dropping duplicates (new media can shift cursor pages) and other kinds. */
export function flattenMediaPages(pages: readonly MediaPage[] | undefined, kind: MediaKind): MediaDTO[] {
  const seen = new Set<string>();
  const out: MediaDTO[] = [];
  for (const page of pages ?? []) {
    for (const m of page.media) {
      if (m.kind !== kind || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export interface MediaPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called with the chosen media; the picker then closes itself. */
  onSelect(media: MediaDTO): void;
  /** Which media to list (default "image"). */
  kind?: "image" | "video";
  title?: string;
  description?: string;
}

type Filter = "all" | "favorites";

/** Dialog that lets the user pick one of their own photos (or videos) from the gallery. */
export function MediaPicker({ open, onOpenChange, onSelect, kind = "image", title, description }: MediaPickerProps) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const favoritesOnly = filter === "favorites";
  const noun = kind === "video" ? "video" : "photo";

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<MediaPage>(
    mediaPickerKey({ kind, favoritesOnly }, open),
    fetcher,
    { revalidateOnFocus: false, revalidateFirstPage: true },
  );

  const items = React.useMemo(() => flattenMediaPages(data, kind), [data, kind]);
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);
  const loadingMore = isValidating && data !== undefined && size > data.length;

  const choose = (m: MediaDTO) => {
    onSelect(m);
    onOpenChange(false);
  };

  let body: React.ReactNode;
  if (error && items.length === 0) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xs border border-dashed border-foreground/25 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">We couldn&apos;t load your {noun}s.</p>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          <RotateCwIcon />
          Try again
        </Button>
      </div>
    );
  } else if (isLoading && items.length === 0) {
    body = (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy="true" aria-label={`Loading ${noun}s`}>
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <Skeleton className="aspect-square w-full rounded-[1px]" />
          </li>
        ))}
      </ul>
    );
  } else if (items.length === 0) {
    body = favoritesOnly ? (
      <EmptyState
        size="sm"
        icon={<HeartIcon />}
        title="No favorites yet"
        description={`Tap the heart on a ${noun} in your gallery to find it here quickly.`}
        action={
          <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
            Show all {noun}s
          </Button>
        }
      />
    ) : (
      <EmptyState
        size="sm"
        icon={kind === "video" ? <ImagesIcon /> : <FilmIcon />}
        title={`No ${noun}s yet`}
        description={
          kind === "video"
            ? "Turn one of your photos into a video and it will show up here."
            : "Create your first AI photos, then come back to pick one."
        }
        action={
          <Button asChild variant="brand" size="sm">
            <Link href={kind === "video" ? "/app/video" : "/app/create"}>
              {kind === "video" ? "Make a video" : "Create photos"}
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((m, i) => (
            <li key={m.id}>
              <MediaCard media={m} onOpen={choose} priority={i < 8} style={{ aspectRatio: "1 / 1" }} />
            </li>
          ))}
        </ul>
        {hasMore && (
          <Button
            variant="outline"
            className="self-center"
            disabled={loadingMore}
            onClick={() => void setSize(size + 1)}
          >
            {loadingMore && <LoaderCircleIcon className="animate-spin" />}
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
        {error && <p className="text-center text-sm text-destructive">Couldn&apos;t load more. Try again.</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? `Choose a ${noun}`}</DialogTitle>
          <DialogDescription>{description ?? `Pick one of your ${noun}s from your gallery.`}</DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Filter"
          className="w-full sm:w-fit"
        >
          <ToggleGroupItem value="all" className="px-4">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="favorites" className="px-4">
            <HeartIcon aria-hidden="true" />
            Favorites
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
