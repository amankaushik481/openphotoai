import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseGalleryFilters } from "@/components/gallery/gallery-filters";
import { MediaViewer } from "@/components/gallery/media-viewer";
import { getCurrentUser, requireUserPage } from "@/server/auth/session";
import { loadViewerData } from "@/server/gallery/viewer";
import { getOwnedMedia } from "@/server/media/service";

/**
 * A distinct title per item ("Photo 3F9A · 12 Mar 2026") so Next's route announcer tells screen-reader
 * users that prev/next (arrow keys) moved to another item; a static "Photo" is never re-announced, and
 * photos from one batch share a date, hence the short reference.
 */
export async function generateMetadata({ params }: { params: Promise<{ mediaId: string }> }): Promise<Metadata> {
  const { mediaId } = await params;
  const user = await getCurrentUser();
  const row = user ? await getOwnedMedia(user.id, mediaId).catch(() => null) : null;
  if (!row) return { title: "Photo" };
  const day = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(row.createdAt);
  return { title: `${row.kind === "video" ? "Video" : "Photo"} ${row.id.slice(-4).toUpperCase()} · ${day}` };
}

type SearchParams = Record<string, string | string[] | undefined>;

function toURLSearchParams(sp: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out.set(key, first);
  }
  return out;
}

export default async function GalleryMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ mediaId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { mediaId } = await params;
  const user = await requireUserPage(`/app/gallery/${encodeURIComponent(mediaId)}`);
  const filters = parseGalleryFilters(toURLSearchParams(await searchParams));
  const data = await loadViewerData(user.id, mediaId, filters);
  if (!data) notFound();

  return (
    <MediaViewer
      // Fresh client state per item (favorite/hidden/folder edits don't leak across prev/next).
      key={data.media.id}
      media={data.media}
      parent={data.parent}
      childMedia={data.children}
      prevId={data.prevId}
      nextId={data.nextId}
      filters={filters}
      details={data.details}
    />
  );
}
