import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseGalleryFilters } from "@/components/gallery/gallery-filters";
import { MediaViewer } from "@/components/gallery/media-viewer";
import { requireUserPage } from "@/server/auth/session";
import { loadViewerData } from "@/server/gallery/viewer";

export const metadata: Metadata = { title: "Photo" };

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
