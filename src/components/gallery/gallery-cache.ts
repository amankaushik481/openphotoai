/**
 * Client-side gallery list cache helpers (pure; unit-tested). The gallery keeps its pages in SWR's
 * in-memory cache across client navigations, so anything that changes media elsewhere (the viewer
 * deleting or favoriting a photo) must patch those cached lists, and lists must be refreshed before
 * their signed URLs run out.
 */
import type { MediaListResponse } from "@/server/gallery/dto";
import type { MediaDTO } from "@/types/domain";
import { matchesGalleryFilters, parseGalleryFilters, type GalleryFilters } from "./gallery-filters";

/** One fetched page of the media list, stamped with the client clock when it arrived. */
export type MediaPage = MediaListResponse<MediaDTO> & { fetchedAt?: number };

/**
 * Signed media URLs stay valid for at least an hour after they are issued (DEFAULT_SIGNED_URL_TTL_SEC
 * in src/providers/storage/url-window.ts). Pages older than this are refetched before lazy tiles that
 * were never on screen try to load an expired URL.
 */
export const SIGNED_URL_REFRESH_MS = 45 * 60_000;

/** `useSWRInfinite` stores a list's pages under this prefix + the first page's key. */
const INFINITE_PREFIX = "$inf$";
const LIST_PATH = "/api/media?";

/** Filters of a cached gallery list from its SWR cache key; null for any other key. */
export function filtersFromListKey(key: string): GalleryFilters | null {
  if (!key.startsWith(INFINITE_PREFIX + LIST_PATH)) return null;
  return parseGalleryFilters(new URLSearchParams(key.slice(INFINITE_PREFIX.length + LIST_PATH.length)));
}

/**
 * Apply `update` to every item of the loaded pages (null removes it; items that no longer match the
 * filters drop out) and adjust the first page's hidden count. Cursors are kept: they are keyset
 * cursors, so removing items never shifts the next page.
 */
export function patchMediaPages(
  pages: readonly MediaPage[],
  update: (m: MediaDTO) => MediaDTO | null,
  filters: GalleryFilters,
  hiddenDelta = 0,
): MediaPage[] {
  return pages.map((p, i) => ({
    ...p,
    media: p.media.flatMap((m) => {
      const next = update(m);
      return next && matchesGalleryFilters(next, filters) ? [next] : [];
    }),
    ...(i === 0 && p.hiddenCount !== undefined ? { hiddenCount: Math.max(0, p.hiddenCount + hiddenDelta) } : {}),
  }));
}

/** True when the oldest loaded page was fetched so long ago that its signed URLs may soon expire. */
export function needsUrlRefresh(pages: readonly MediaPage[] | undefined, now: number): boolean {
  if (!pages?.length) return false;
  const oldest = Math.min(...pages.map((p) => p.fetchedAt ?? now));
  return now - oldest > SIGNED_URL_REFRESH_MS;
}

/** Change to a list's "hidden" count when `before` becomes `after` (null: deleted). */
export function hiddenCountDelta(
  before: MediaDTO,
  after: MediaDTO | null,
  filters: GalleryFilters,
): number {
  // The count covers hidden media matching the list's other filters.
  const counted = (m: MediaDTO | null) => Boolean(m?.hidden && matchesGalleryFilters(m, { ...filters, showHidden: true }));
  return Number(counted(after)) - Number(counted(before));
}

interface CacheLike {
  keys(): IterableIterator<string>;
}
type MutateLike = (
  key: string,
  data: (pages: MediaPage[] | undefined) => MediaPage[] | undefined,
  opts: { revalidate: false },
) => unknown;

/**
 * A change to one media item made outside the gallery list (the viewer): patch every cached gallery
 * list so returning to it never shows a deleted photo or a stale favorite. The list refetches itself
 * when it mounts again; this only keeps the first paint right.
 */
export function patchCachedMediaLists(
  cache: CacheLike,
  mutate: MutateLike,
  before: MediaDTO,
  after: MediaDTO | null,
): void {
  for (const key of [...cache.keys()]) {
    const filters = filtersFromListKey(key);
    if (!filters) continue;
    const delta = hiddenCountDelta(before, after, filters);
    // Only the editable fields: the cached item keeps its own signed URLs (no image reload).
    const update = (m: MediaDTO): MediaDTO | null =>
      m.id !== before.id
        ? m
        : after && { ...m, isFavorite: after.isFavorite, folderId: after.folderId, hidden: after.hidden };
    void mutate(key, (pages) => (pages ? patchMediaPages(pages, update, filters, delta) : pages), {
      revalidate: false,
    });
  }
}
