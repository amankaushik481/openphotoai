"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderInputIcon,
  HeartIcon,
  PencilIcon,
  Share2Icon,
  ShirtIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyButton } from "@/components/app/copy-button";
import { MediaCard } from "@/components/app/media-card";
import { EnhanceQuickActions } from "@/components/enhance/enhance-panel";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { JobType, MediaDTO } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { galleryHref, viewerHref, type GalleryFilters } from "./gallery-filters";
import { MoveToFolderMenu } from "./move-to-folder-menu";
import { ShareDialog } from "./share-dialog";
import { useFolders } from "./use-gallery";

export interface MediaViewerProps {
  media: MediaDTO;
  parent: MediaDTO | null;
  childMedia: MediaDTO[];
  prevId: string | null;
  nextId: string | null;
  filters: GalleryFilters;
  details: {
    modelName: string | null;
    packSlug: string | null;
    packName: string | null;
    batchId: string | null;
    jobType: JobType | null;
    seed: number | null;
  };
}

const LINEAGE_LABEL: Partial<Record<JobType, string>> = {
  generate: "Full-quality version of",
  edit: "Edited from",
  inpaint: "Edited from",
  upscale: "Upscaled from",
  face_restore: "Face restored from",
  remove_background: "Background removed from",
  video: "Animated from",
  talking_video: "Animated from",
  try_on: "Try-on made from",
  pose_copy: "Made from",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Overlays (dialogs, menus) own the keyboard while open. */
function overlayOpen(): boolean {
  return Boolean(document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]"));
}

export function MediaViewer({
  media: initial,
  parent,
  childMedia,
  prevId,
  nextId,
  filters,
  details,
}: MediaViewerProps) {
  const t = useT();
  const router = useRouter();
  const { mutate: mutateFolders } = useFolders();
  const [media, setMedia] = React.useState(initial);
  const [shareOpen, setShareOpen] = React.useState(false);

  const backHref = galleryHref(filters);
  const prevHref = prevId ? viewerHref(prevId, filters) : null;
  const nextHref = nextId ? viewerHref(nextId, filters) : null;
  const isImage = media.kind === "image";

  React.useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
  }, [router, prevHref, nextHref]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target) || overlayOpen()) return;
      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref, { scroll: false });
      else if (e.key === "ArrowRight" && nextHref) router.push(nextHref, { scroll: false });
      else if (e.key === "Escape") router.push(backHref, { scroll: false });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref, backHref]);

  const fail = (err: unknown) =>
    toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));

  async function patch(body: Partial<Pick<MediaDTO, "isFavorite" | "folderId" | "hidden">>, success?: string) {
    const before = media;
    setMedia({ ...media, ...body });
    try {
      const res = await api<{ media: MediaDTO }>(`/api/media/${media.id}`, { method: "PATCH", body });
      setMedia(res.media);
      if (success) toast.success(success);
      return true;
    } catch (err) {
      setMedia(before);
      fail(err);
      return false;
    }
  }

  async function remove() {
    await api(`/api/media/${media.id}`, { method: "DELETE" });
    toast.success(media.kind === "video" ? "Video deleted" : "Photo deleted");
    void mutateFolders();
    router.replace(nextHref ?? prevHref ?? backHref, { scroll: false });
    router.refresh();
  }

  const created = new Date(media.createdAt);
  const lineageLabel = (details.jobType && LINEAGE_LABEL[details.jobType]) ?? "Made from";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref} scroll={false}>
            <ArrowLeftIcon aria-hidden="true" />
            {t("nav.gallery")}
          </Link>
        </Button>
        <nav aria-label="Browse" className="flex items-center gap-1">
          <NavButton href={prevHref} label="Previous (newer)" icon={<ChevronLeftIcon />} />
          <NavButton href={nextHref} label="Next (older)" icon={<ChevronRightIcon />} />
        </nav>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <figure className="relative flex min-h-[40dvh] items-center justify-center overflow-hidden rounded-xl bg-muted lg:min-h-[70dvh]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer
            <img
              src={media.url}
              alt={media.prompt ? media.prompt.slice(0, 200) : "Generated photo"}
              width={media.width ?? undefined}
              height={media.height ?? undefined}
              fetchPriority="high"
              className="max-h-[75dvh] w-auto max-w-full object-contain"
            />
          ) : (
            <video
              src={media.url}
              poster={media.thumbUrl !== media.url ? media.thumbUrl : undefined}
              controls
              playsInline
              loop
              preload="metadata"
              className="max-h-[75dvh] w-full"
            >
              <track kind="captions" />
            </video>
          )}
          {media.hidden && (
            <Badge variant="secondary" className="absolute top-3 left-3 bg-background/85 backdrop-blur-sm">
              <EyeOffIcon aria-hidden="true" />
              Hidden
            </Badge>
          )}
          <figcaption className="sr-only">
            {media.kind === "video" ? "AI-generated video" : "AI-generated photo"}, created{" "}
            {created.toLocaleString(t.locale)}
          </figcaption>
        </figure>

        <aside className="flex flex-col gap-5" aria-label="Details and actions">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={media.isFavorite ? "secondary" : "outline"}
              aria-pressed={media.isFavorite}
              onClick={() => void patch({ isFavorite: !media.isFavorite })}
            >
              <HeartIcon aria-hidden="true" className={cn(media.isFavorite && "fill-current text-rose-500")} />
              {media.isFavorite ? "Favorited" : "Favorite"}
            </Button>
            <Button asChild variant="outline">
              <a href={media.downloadUrl} download>
                <DownloadIcon aria-hidden="true" />
                {t("common.download")}
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2Icon aria-hidden="true" />
              {t("common.share")}
            </Button>
          </div>

          {isImage && (
            <section aria-labelledby="viewer-create" className="flex flex-col gap-2">
              <h2 id="viewer-create" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Create from this
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/edit/${media.id}`}>
                    <PencilIcon aria-hidden="true" />
                    {t("common.edit")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/video?mediaId=${encodeURIComponent(media.id)}`}>
                    <ClapperboardIcon aria-hidden="true" />
                    Make video
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/try-on?mediaId=${encodeURIComponent(media.id)}`}>
                    <ShirtIcon aria-hidden="true" />
                    Try on
                  </Link>
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SparklesIcon aria-hidden="true" className="size-4" />
                Enhance
                <EnhanceQuickActions media={media} />
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <MoveToFolderMenu
              currentFolderId={media.folderId}
              onMove={async (folderId, name) => {
                if (await patch({ folderId }, folderId ? `Moved to “${name}”` : "Removed from folder")) {
                  void mutateFolders();
                }
              }}
              trigger={
                <Button type="button" variant="ghost" size="sm">
                  <FolderInputIcon aria-hidden="true" />
                  Move to folder
                </Button>
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                void patch(
                  { hidden: !media.hidden },
                  media.hidden ? "Shown in your gallery again" : "Hidden — find it with “Show hidden”",
                )
              }
            >
              {media.hidden ? <EyeIcon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
              {media.hidden ? "Unhide" : "Hide"}
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2Icon aria-hidden="true" />
                  {t("common.delete")}
                </Button>
              }
              title={media.kind === "video" ? "Delete this video?" : "Delete this photo?"}
              description="It's permanently deleted from storage and its share links stop working. This can't be undone."
              confirmLabel="Delete permanently"
              destructive
              onConfirm={remove}
            />
          </div>

          <Separator />

          <MediaDetails media={media} details={details} />

          {parent && (
            <section aria-labelledby="viewer-parent" className="flex flex-col gap-2">
              <h2 id="viewer-parent" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {lineageLabel}
              </h2>
              <MediaCard media={parent} href={viewerHref(parent.id, {})} className="w-28" />
            </section>
          )}

          {childMedia.length > 0 && (
            <section aria-labelledby="viewer-children" className="flex flex-col gap-2">
              <h2 id="viewer-children" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Versions made from this
              </h2>
              <ul className="grid grid-cols-4 gap-2">
                {childMedia.map((c) => (
                  <li key={c.id}>
                    <MediaCard media={c} href={viewerHref(c.id, {})} style={{ aspectRatio: "1 / 1" }} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <ShareDialog
        target={{ mediaId: media.id }}
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={media.kind === "video" ? "Share video" : "Share photo"}
      />
    </div>
  );
}

function NavButton({ href, label, icon }: { href: string | null; label: string; icon: React.ReactNode }) {
  if (!href) {
    return (
      <Button type="button" variant="outline" size="icon-sm" disabled aria-label={label}>
        {icon}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon-sm">
      <Link href={href} scroll={false} aria-label={label} title={`${label} — arrow key`}>
        {icon}
      </Link>
    </Button>
  );
}

function ScoreMeter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        aria-describedby={undefined}
        title={hint}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MediaDetails({ media, details }: Pick<MediaViewerProps, "media" | "details">) {
  const t = useT();
  const created = new Date(media.createdAt);
  const rows: [string, React.ReactNode][] = [];
  if (details.modelName) rows.push(["Model", details.modelName]);
  if (details.packSlug) {
    rows.push([
      "Pack",
      <Link key="pack" href={`/app/packs/${details.packSlug}`} className="underline-offset-4 hover:underline">
        {details.packName ?? details.packSlug}
      </Link>,
    ]);
  }
  if (details.batchId) {
    rows.push([
      "Batch",
      <Link key="batch" href={`/app/batches/${details.batchId}`} className="underline-offset-4 hover:underline">
        View batch
      </Link>,
    ]);
  }
  rows.push([
    "Created",
    <time key="created" dateTime={media.createdAt}>
      {created.toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short" })}
    </time>,
  ]);
  if (media.width && media.height) rows.push(["Resolution", `${media.width} × ${media.height}`]);
  if (media.durationSec != null) rows.push(["Duration", `${Math.round(media.durationSec)}s`]);
  if (details.seed != null)
    rows.push([
      "Seed",
      <span key="seed" className="font-mono text-xs">
        {details.seed}
      </span>,
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          <SparklesIcon aria-hidden="true" />
          AI-generated
        </Badge>
        {media.isDraft && <Badge variant="outline">{t("media.draft")}</Badge>}
      </div>

      {media.prompt && (
        <section aria-labelledby="viewer-prompt" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="viewer-prompt" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Prompt
            </h2>
            <CopyButton value={media.prompt} toastMessage="Prompt copied" variant="ghost" />
          </div>
          <p className="text-sm leading-relaxed break-words whitespace-pre-line">{media.prompt}</p>
        </section>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right">{value}</dd>
          </React.Fragment>
        ))}
      </dl>

      {media.scores && (media.scores.likeness != null || media.scores.quality != null) && (
        <section aria-labelledby="viewer-scores" className="flex flex-col gap-3">
          <h2 id="viewer-scores" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Scores
          </h2>
          {media.scores.likeness != null && (
            <ScoreMeter
              label="Likeness"
              value={media.scores.likeness}
              hint="How closely the face matches your consent selfie"
            />
          )}
          {media.scores.quality != null && (
            <ScoreMeter
              label="Quality"
              value={media.scores.quality}
              hint="Sharpness, exposure and overall image quality"
            />
          )}
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {media.watermarked
          ? "This file carries a visible watermark (free plan) and AI-generated metadata. Upgrade to create watermark-free photos."
          : "This file carries AI-generated metadata (IPTC “trained algorithmic media”), so platforms can label it."}
      </p>
    </div>
  );
}
