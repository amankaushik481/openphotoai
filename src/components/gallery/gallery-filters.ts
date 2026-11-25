/**
 * Gallery filter state <-> URL query string (pure; unit-tested). The gallery URL uses the same
 * parameter names as `GET /api/media`, so a filtered gallery link is also a valid API query.
 */
export interface GalleryFilters {
  folderId?: string;
  favorite?: boolean;
  kind?: "image" | "video";
  modelId?: string;
  packId?: string;
  batchId?: string;
  showHidden?: boolean;
}

export type GalleryView = "all" | "favorites" | "photos" | "videos";

type ParamsLike = Pick<URLSearchParams, "get">;

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const idOrUndefined = (v: string | null) => (v && ID_RE.test(v) ? v : undefined);
const isTrue = (v: string | null) => v === "true" || v === "1";

export function parseGalleryFilters(params: ParamsLike): GalleryFilters {
  const kind = params.get("kind");
  return {
    folderId: idOrUndefined(params.get("folderId")),
    favorite: isTrue(params.get("favorite")) || undefined,
    kind: kind === "image" || kind === "video" ? kind : undefined,
    modelId: idOrUndefined(params.get("modelId")),
    packId: idOrUndefined(params.get("packId")),
    batchId: idOrUndefined(params.get("batchId")),
    showHidden: isTrue(params.get("showHidden")) || undefined,
  };
}

/** Query string (no leading "?") with keys in a stable order; empty filters are omitted. */
export function serializeGalleryFilters(f: GalleryFilters): string {
  const params = new URLSearchParams();
  if (f.folderId) params.set("folderId", f.folderId);
  if (f.favorite) params.set("favorite", "true");
  if (f.kind) params.set("kind", f.kind);
  if (f.modelId) params.set("modelId", f.modelId);
  if (f.packId) params.set("packId", f.packId);
  if (f.batchId) params.set("batchId", f.batchId);
  if (f.showHidden) params.set("showHidden", "true");
  return params.toString();
}

export function galleryHref(f: GalleryFilters): string {
  const qs = serializeGalleryFilters(f);
  return qs ? `/app/gallery?${qs}` : "/app/gallery";
}

/** Viewer link that keeps the list context (prev/next follow the same filters). */
export function viewerHref(mediaId: string, f: GalleryFilters): string {
  const qs = serializeGalleryFilters(f);
  return `/app/gallery/${encodeURIComponent(mediaId)}${qs ? `?${qs}` : ""}`;
}

export function mediaPageUrl(f: GalleryFilters, opts: { cursor?: string | null; limit: number }): string {
  const params = new URLSearchParams(serializeGalleryFilters(f));
  params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  return `/api/media?${params.toString()}`;
}

export function viewOf(f: GalleryFilters): GalleryView {
  if (f.favorite) return "favorites";
  if (f.kind === "video") return "videos";
  if (f.kind === "image") return "photos";
  return "all";
}

export function withView(f: GalleryFilters, view: GalleryView): GalleryFilters {
  return {
    ...f,
    favorite: view === "favorites" ? true : undefined,
    kind: view === "videos" ? "video" : view === "photos" ? "image" : undefined,
  };
}

/** True when anything narrows the list (used to pick the empty state). */
export function hasNarrowingFilters(f: GalleryFilters): boolean {
  return Boolean(f.folderId || f.favorite || f.kind || f.modelId || f.packId || f.batchId);
}

interface FilterableMedia {
  folderId: string | null;
  isFavorite: boolean;
  kind: "image" | "video";
  modelId: string | null;
  packId: string | null;
  hidden: boolean;
}

/** Whether a (locally updated) item still belongs in the filtered list. Batch can't be checked client-side. */
export function matchesGalleryFilters(m: FilterableMedia, f: GalleryFilters): boolean {
  if (f.folderId && m.folderId !== f.folderId) return false;
  if (f.favorite && !m.isFavorite) return false;
  if (f.kind && m.kind !== f.kind) return false;
  if (f.modelId && m.modelId !== f.modelId) return false;
  if (f.packId && m.packId !== f.packId) return false;
  if (!f.showHidden && m.hidden) return false;
  return true;
}
