import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRightIcon, DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/gallery/report-dialog";
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

/** The print's lab label: what it is, in mono. */
function AiLabel({ className }: { className?: string }) {
  return (
    <p className={className ?? "font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"}>
      <span aria-hidden="true" className="mr-2 inline-block size-1.5 rounded-full bg-safelight-ink align-middle" />
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

/** Colophon under the print: what this is and how to make your own. */
function MadeWith() {
  return (
    <aside
      aria-labelledby="made-with-title"
      className="grid w-full gap-5 border-t border-foreground pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-10"
    >
      <div>
        <p className="mono-caps text-muted-foreground">Colophon</p>
        <h2 id="made-with-title" className="mt-2 font-display text-3xl leading-tight">
          Made with {APP.name}
        </h2>
        <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">
          The open-source AI photographer: headshots, dating and travel photos of you from a few selfies. Free drafts,
          and shots that miss on likeness are refunded.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="brand" className="rounded-[3px]">
          <Link href="/">
            Create your own photos
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-[3px]">
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
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-14">
        <h1 className="sr-only">Shared {noun}</h1>
        <figure className="mx-auto flex w-fit max-w-full flex-col">
          {/* Matted print: the photo sits in a window cut into paper board, with a thin bevel. */}
          <div className="print-paper max-w-full p-3 pb-12 shadow-print sm:p-8 sm:pb-16">
            <div className="flex justify-center bg-[#0e0d0b] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25),0_0_0_1px_rgb(255_255_255/0.6),0_0_0_2px_rgb(22_20_15/0.12)]">
              <SharedItem item={item} full priority className="max-h-[72dvh] w-auto max-w-full object-contain" />
            </div>
          </div>
          <figcaption className="mt-5 flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <AiLabel />
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="brand" className="rounded-[3px]">
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
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-foreground pb-3">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="mono-caps text-muted-foreground">
            Shared folder · {items.length} {items.length === 1 ? "frame" : "frames"}
          </p>
          <h1 className="font-display text-4xl leading-none break-words sm:text-6xl">{share.folderName}</h1>
          <AiLabel />
        </div>
        <ReportDialog shareToken={token} triggerClassName="text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <div className="py-6">
          <div aria-hidden="true" className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="aspect-[4/5] w-16 border border-dashed border-foreground/40 sm:w-20" />
            ))}
          </div>
          <p className="mono-caps mt-5 text-muted-foreground">Empty roll</p>
          <p className="mt-2 text-muted-foreground">
            This folder is empty right now. Check back later, or ask the person who shared it.
          </p>
        </div>
      ) : (
        <ul className="columns-2 gap-4 sm:columns-3 sm:gap-6" aria-label={`${items.length} ${noun}`}>
          {items.map((item, i) => (
            <li
              key={item.id}
              className="print-paper relative mb-4 break-inside-avoid p-2 pb-7 shadow-print sm:mb-6 sm:p-2.5 sm:pb-8"
            >
              <span
                aria-hidden="true"
                className="absolute bottom-2 left-2.5 font-mono text-[9px] tracking-[0.14em] text-[#16140f]/70 sm:bottom-2.5"
              >
                ▸{String(i + 1).padStart(2, "0")}
              </span>
              {item.kind === "video" ? (
                <SharedItem item={item} className="w-full" />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-[#0e0d0b] [--focus-offset:-3px]"
                  aria-label={`Open photo ${i + 1} in full size (opens in a new tab)`}
                >
                  <SharedItem item={item} priority={i < 2} className="h-auto w-full" />
                </a>
              )}
              <a
                href={item.downloadUrl}
                download
                aria-label={`Download ${item.kind === "video" ? "video" : "photo"} ${i + 1}`}
                className="absolute right-1 bottom-0.5 inline-flex size-7 items-center justify-center rounded-[2px] text-[#16140f]/70 transition-colors hover:bg-[#16140f]/10 hover:text-[#16140f] pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
              >
                <DownloadIcon aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <MadeWith />
    </div>
  );
}
