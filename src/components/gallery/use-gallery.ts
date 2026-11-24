"use client";

import * as React from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { api, fetcher } from "@/lib/api-client";
import type { BulkAction, FolderDTO, MediaListResponse } from "@/server/gallery/dto";
import type { MediaDTO } from "@/types/domain";
import { matchesGalleryFilters, mediaPageUrl, type GalleryFilters } from "./gallery-filters";

export const FOLDERS_KEY = "/api/folders";
export const GALLERY_PAGE_SIZE = 40;

type MediaPage = MediaListResponse<MediaDTO>;

/** The user's folders with media counts. */
export function useFolders() {
  const { data, error, isLoading, mutate } = useSWR<{ folders: FolderDTO[] }>(FOLDERS_KEY, fetcher, {
    revalidateOnFocus: false,
  });
  return { folders: data?.folders, error, isLoading, mutate };
}

/** Infinite, cursor-paginated media list for the given filters. */
export function useMediaList(filters: GalleryFilters, pageSize = GALLERY_PAGE_SIZE) {
  const getKey = React.useCallback(
    (index: number, previous: MediaPage | null) => {
      if (index > 0 && !previous?.nextCursor) return null;
      return mediaPageUrl(filters, { cursor: index > 0 ? previous?.nextCursor : null, limit: pageSize });
    },
    [filters, pageSize],
  );
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<MediaPage>(getKey, fetcher, {
    revalidateFirstPage: false,
    revalidateOnFocus: false,
  });

  const media = React.useMemo(() => {
    const seen = new Set<string>();
    const out: MediaDTO[] = [];
    for (const page of data ?? []) {
      for (const m of page.media) {
        if (seen.has(m.id)) continue; // new media can shift cursor pages
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  }, [data]);

  const last = data?.[data.length - 1];
  const hasMore = Boolean(last?.nextCursor);
  const isLoadingMore = isLoading || (size > 0 && data !== undefined && data[size - 1] === undefined);

  const loadMore = React.useCallback(() => {
    if (hasMore && !isLoadingMore) void setSize((s) => s + 1);
  }, [hasMore, isLoadingMore, setSize]);

  /**
   * Apply a local change to every loaded page (items that no longer match the filters drop out) without
   * refetching: fresh pages would carry new signed URLs and make every thumbnail reload.
   */
  const patchLocal = React.useCallback(
    (update: (m: MediaDTO) => MediaDTO | null, hiddenDelta = 0) =>
      mutate(
        (pages) =>
          pages?.map((p, i) => ({
            ...p,
            media: p.media.flatMap((m) => {
              const next = update(m);
              return next && matchesGalleryFilters(next, filters) ? [next] : [];
            }),
            ...(i === 0 && p.hiddenCount !== undefined
              ? { hiddenCount: Math.max(0, p.hiddenCount + hiddenDelta) }
              : {}),
          })),
        { revalidate: false },
      ),
    [mutate, filters],
  );

  return {
    media,
    hiddenCount: data?.[0]?.hiddenCount ?? 0,
    error,
    isLoading,
    isValidating,
    isLoadingMore,
    hasMore,
    loadMore,
    patchLocal,
    revalidate: () => mutate(),
  };
}

/** Change in the "hidden" count when `action` runs on `items`. */
export function hiddenDeltaFor(action: BulkAction, items: readonly Pick<MediaDTO, "hidden">[]): number {
  if (action === "hide") return items.filter((m) => !m.hidden).length;
  if (action === "unhide" || action === "delete") return -items.filter((m) => m.hidden).length;
  return 0;
}

/** Local result of a bulk action on one item (null = removed from the gallery). */
export function applyBulkLocally(m: MediaDTO, action: BulkAction, folderId: string | null = null): MediaDTO | null {
  switch (action) {
    case "favorite":
      return { ...m, isFavorite: true };
    case "unfavorite":
      return { ...m, isFavorite: false };
    case "hide":
      return { ...m, hidden: true };
    case "unhide":
      return { ...m, hidden: false };
    case "move":
      return { ...m, folderId };
    case "delete":
      return null;
  }
}

export async function runBulkAction(action: BulkAction, ids: readonly string[], folderId?: string | null) {
  return api<{ updated: number }>("/api/media/bulk", {
    method: "POST",
    body: { action, ids, ...(action === "move" ? { folderId: folderId ?? null } : {}) },
  });
}
