import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ReportDialog } from "@/components/gallery/report-dialog";
import { APP } from "@/config/app";
import type { PublicMediaDTO } from "@/server/gallery/dto";
import { incrementShareViews, resolveShare, toPublicMediaDTO } from "@/server/gallery/share";
import { signedUrl } from "@/server/storage";

// Signed URLs expire and every visit counts a view: never cache this page.
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/** One lookup per request, shared by generateMetadata and the page. */
const getShare = cache((token: string) => resolveShare(token));

const ROBOTS: Metadata["robots"] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };
/** Social previews fetch the image once; give them longer than the 1h page URLs. */
const PREVIEW_TTL_SEC = 7 * 24 * 3600;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) return { title: "Link unavailable", robots: ROBOTS, referrer: "no-referrer" };

  const first = share.media[0];
  const title = share.folderName ?? (first?.kind === "video" ? "Shared video" : "Shared photo");
  const description = `AI-generated with ${APP.name}.`;
  const preview = share.media.find((m) => m.kind === "image");
  const image = preview
    ? { url: await signedUrl(preview.storageKey, { expiresInSec: PREVIEW_TTL_SEC }), width: preview.width ?? undefined, height: preview.height ?? undefined }
    : undefined;
  return {
    title,
    description,
    robots: ROBOTS,
    // The URL is a capability: don't leak it to storage hosts or outbound links.
    referrer: "no-referrer",
    openGraph: { title, description, type: "website", images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
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
      >
        <track kind="captions" />
      </video>
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

export default async function SharedMediaPage({ params }: { params: Params }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) notFound();

  await incrementShareViews(share.link.id);
  const items = await Promise.all(share.media.map((m) => toPublicMediaDTO(m)));

  if (share.folderName === null) {
    const item = items[0]!;
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="sr-only">{item.kind === "video" ? "Shared video" : "Shared photo"}</h1>
        <figure className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full justify-center overflow-hidden rounded-2xl bg-muted">
            <SharedItem item={item} full priority className="max-h-[78dvh] w-auto max-w-full object-contain" />
          </div>
          <figcaption className="flex w-full flex-wrap items-center justify-between gap-3">
            <AiLabel />
            <ReportDialog shareToken={token} triggerClassName="text-muted-foreground" />
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl sm:text-4xl">{share.folderName}</h1>
          <AiLabel />
        </div>
        <ReportDialog shareToken={token} triggerClassName="text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-16 text-center text-muted-foreground">
          This folder is empty right now.
        </p>
      ) : (
        <ul className="columns-2 gap-3 sm:columns-3" aria-label={`${items.length} items`}>
          {items.map((item, i) => (
            <li key={item.id} className="mb-3 break-inside-avoid overflow-hidden rounded-xl bg-muted">
              {item.kind === "video" ? (
                <SharedItem item={item} className="w-full" />
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
                  aria-label={`Open photo ${i + 1} in full size`}
                >
                  <SharedItem item={item} priority={i < 2} className="h-auto w-full" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
