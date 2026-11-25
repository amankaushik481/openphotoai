"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite, { unstable_serialize } from "swr/infinite";
import { api, fetcher } from "@/lib/api-client";
import type { BulkAction, FolderDTO, MediaListResponse } from "@/server/gallery/dto";
import type { MediaDTO } from "@/types/domain";
import { needsUrlRefresh, patchCachedMediaLists, patchMediaPages, type MediaPage } from "./gallery-cache";
import { mediaPageUrl, type GalleryFilters } from "./gallery-filters";

export const FOLDERS_KEY = "/api/folders";
export const GALLERY_PAGE_SIZE = 40;
/** How often a visible gallery checks whether its signed URLs need refreshing. */
const URL_CHECK_INTERVAL_MS = 60_000;

const pageFetcher = async (url: string): Promise<MediaPage> => ({
  ...(await fetcher<MediaListResponse<MediaDTO>>(url)),
  fetchedAt: Date.now(),
});

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
  const { cache } = useSWRConfig();
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<MediaPage>(
    getKey,
    pageFetcher,
    {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      // SWR's own check of a cached list only refetches pages changed locally: a photo deleted in the
      // viewer, or photos made on another page, would stay stale. The list is refreshed in full below.
      revalidateIfStale: false,
    },
  );

  // Pages cached from an earlier visit (client navigation keeps them) may hold deleted or edited
  // media, miss new ones and carry aging signed URLs: refetch them all once when the list shows up
  // again. A first visit (nothing cached yet) fetches on its own.
  const infiniteKey = unstable_serialize(getKey);
  React.useEffect(() => {
    if (cache.get(infiniteKey)?.data !== undefined) void mutate();
  }, [cache, infiniteKey, mutate]);

  // Long sessions: refresh before lazy tiles that were never on screen load an expired URL.
  React.useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (needsUrlRefresh(cache.get(infiniteKey)?.data as MediaPage[] | undefined, Date.now())) void mutate();
    };
    const timer = window.setInterval(check, URL_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [cache, infiniteKey, mutate]);

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
      mutate((pages) => pages && patchMediaPages(pages, update, filters, hiddenDelta), { revalidate: false }),
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

/**
 * For changes made outside the list (the viewer): patch every gallery list cached in memory, so going
 * back to the gallery never shows a deleted photo or a stale favorite.
 */
export function useCachedListPatcher() {
  const { cache, mutate } = useSWRConfig();
  return React.useCallback(
    (before: MediaDTO, after: MediaDTO | null) =>
      patchCachedMediaLists(cache, (key, data, opts) => mutate(key, data, opts), before, after),
    [cache, mutate],
  );
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
