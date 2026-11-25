import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRightIcon, DownloadIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/gallery/report-dialog";
import { LogoMark } from "@/components/layout/logo";
import { APP } from "@/config/app";
import type { MediaRow } from "@/db/types";
import type { PublicMediaDTO } from "@/server/gallery/dto";
import { runAfterResponse } from "@/server/after";
import { incrementShareViews, resolveShare, toPublicMediaDTO } from "@/server/gallery/share";
import { extForMime } from "@/server/media/service";
import { signedUrl } from "@/server/storage";

// Signed URLs expire and every visit counts a view: never cache this page.
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/** One lookup per request, shared by generateMetadata and the page. */
const getShare = cache((token: string) => resolveShare(token));

const ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};
/**
 * Social previews fetch (and cache) the image when the link is posted. Keep the signed URL short:
 * it stays valid after the share is revoked, so its lifetime bounds how long revocation lags.
 */
const PREVIEW_TTL_SEC = 3600;

function itemNoun(rows: readonly Pick<MediaRow, "kind">[]): string {
  const videos = rows.filter((m) => m.kind === "video").length;
  if (rows.length === 1) return videos ? "video" : "photo";
  return videos === rows.length ? "videos" : videos ? "photos and videos" : "photos";
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) return { title: "Link unavailable", robots: ROBOTS, referrer: "no-referrer" };

  const noun = itemNoun(share.media);
  const title = share.folderName ?? `Shared ${noun}`;
  const description =
    share.folderName === null
      ? `An AI-generated ${noun} made with ${APP.name}, the open-source AI photographer.`
      : `${share.media.length} AI-generated ${noun} made with ${APP.name}, the open-source AI photographer.`;
  // Videos preview with their poster frame.
  const preview = share.media.find((m) => m.kind === "image") ?? share.media.find((m) => m.thumbKey);
  const previewKey = preview?.kind === "image" ? preview.storageKey : preview?.thumbKey;
  const image =
    preview && previewKey
      ? {
          url: await signedUrl(previewKey, { expiresInSec: PREVIEW_TTL_SEC }),
          width: preview.width ?? undefined,
          height: preview.height ?? undefined,
          alt: `AI-generated ${preview.kind === "video" ? "video" : "photo"} made with ${APP.name}`,
        }
      : undefined;
  return {
    title,
    description,
    robots: ROBOTS,
    // The URL is a capability: don't leak it to storage hosts or outbound links.
    referrer: "no-referrer",
    openGraph: { title, description, siteName: APP.name, type: "website", images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

type SharedMedia = PublicMediaDTO & { downloadUrl: string };

/** Public DTO plus a signed URL that downloads (Content-Disposition: attachment) instead of opening. */
async function toSharedMedia(row: MediaRow): Promise<SharedMedia> {
  const brand =
    APP.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "media";
  const [dto, downloadUrl] = await Promise.all([
    toPublicMediaDTO(row),
    signedUrl(row.storageKey, { downloadName: `${brand}-${row.id}.${extForMime(row.mimeType)}` }),
  ]);
  return { ...dto, downloadUrl };
}

function AiLabel() {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Badge variant="secondary">
        <SparklesIcon aria-hidden="true" />
        AI-generated
      </Badge>
      Made with {APP.name} (AI-generated)
    </p>
  );
}

function SharedItem({
  item,
  full,
  priority,
  className,
}: {
  item: PublicMediaDTO;
  /** Full-size image instead of the thumbnail. */
  full?: boolean;
  priority?: boolean;
  className?: string;
}) {
  if (item.kind === "video") {
    return (
      <video
        src={item.url}
        poster={item.thumbUrl !== item.url ? item.thumbUrl : undefined}
        controls
        playsInline
        loop
        preload="metadata"
        className={className}
        aria-label="AI-generated video"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer
    <img
      src={full ? item.url : item.thumbUrl}
      alt="AI-generated photo"
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}

/** "Made with" card: what this is and how to make your own. */
function MadeWith() {
  return (
    <aside
      aria-labelledby="made-with-title"
      className="flex w-full flex-col gap-5 rounded-2xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-3">
        <LogoMark className="mt-0.5 size-9 rounded-xl" />
        <div>
          <h2 id="made-with-title" className="font-semibold">
            Made with {APP.name}
          </h2>
          <p className="mt-1 max-w-md text-sm text-pretty text-muted-foreground">
            The open-source AI photographer: headshots, dating and travel photos of you from a few selfies. Free drafts,
            and shots that miss on likeness are refunded.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
        <Button asChild variant="brand">
          <Link href="/">
            Create your own photos
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/packs">Browse photo packs</Link>
        </Button>
      </div>
    </aside>
  );
}

export default async function SharedMediaPage({ params }: { params: Params }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) notFound();

  // The view counter is a write: don't hold the page for it.
  const linkId = share.link.id;
  await runAfterResponse("share view counter", () => incrementShareViews(linkId));
  const items = await Promise.all(share.media.map((m) => toSharedMedia(m)));

  if (share.folderName === null) {
    const item = items[0]!;
    const noun = item.kind === "video" ? "video" : "photo";
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="sr-only">Shared {noun}</h1>
        <figure className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full justify-center overflow-hidden rounded-2xl bg-muted">
            <SharedItem item={item} full priority className="max-h-[78dvh] w-auto max-w-full object-contain" />
          </div>
          <figcaption className="flex w-full flex-wrap items-center justify-between gap-3">
            <AiLabel />
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={item.downloadUrl} download>
                  <DownloadIcon aria-hidden="true" />
                  Download {noun}
                </a>
              </Button>
              <ReportDialog shareToken={token} triggerClassName="text-muted-foreground" />
            </div>
          </figcaption>
        </figure>
        <MadeWith />
      </div>
    );
  }

  const noun = itemNoun(share.media);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl break-words sm:text-4xl">{share.folderName}</h1>
          <AiLabel />
        </div>
        <ReportDialog shareToken={token} triggerClassName="text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-16 text-center text-muted-foreground">
          This folder is empty right now. Check back later, or ask the person who shared it.
        </p>
      ) : (
        <ul className="columns-2 gap-3 sm:columns-3" aria-label={`${items.length} ${noun}`}>
          {items.map((item, i) => (
            <li key={item.id} className="relative mb-3 break-inside-avoid overflow-hidden rounded-xl bg-muted">
              {item.kind === "video" ? (
                <SharedItem item={item} className="w-full" />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block [--focus-offset:-5px] focus-visible:outline-background focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
                  aria-label={`Open photo ${i + 1} in full size (opens in a new tab)`}
                >
                  <SharedItem item={item} priority={i < 2} className="h-auto w-full" />
                </a>
              )}
              <a
                href={item.downloadUrl}
                download
                aria-label={`Download ${item.kind === "video" ? "video" : "photo"} ${i + 1}`}
                className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-white pointer-coarse:size-11"
              >
                <DownloadIcon aria-hidden="true" className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <MadeWith />
    </div>
  );
}
