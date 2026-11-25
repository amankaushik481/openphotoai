"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  CoinsIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderInputIcon,
  HeartIcon,
  LoaderCircleIcon,
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
import { useScriptCaptions } from "@/components/app/use-script-captions";
import { EnhanceQuickActions } from "@/components/enhance/enhance-panel";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { JobType, MediaDTO } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { SIGNED_URL_REFRESH_MS } from "./gallery-cache";
import { galleryHref, serializeGalleryFilters, viewerHref, type GalleryFilters } from "./gallery-filters";
import { rememberGalleryReturn, sessionStore } from "./gallery-return";
import { MoveToFolderMenu } from "./move-to-folder-menu";
import { ShareDialog } from "./share-dialog";
import { useCachedListPatcher, useFolders } from "./use-gallery";
import { VIEWER_TOOL_COSTS, creditsLabel } from "./viewer-actions";
import { requestNavFocus, takeNavFocus, type NavDirection, type Zoom } from "./viewer-gestures";
import { ViewerRemix } from "./viewer-remix";
import { ViewerStage, type StageLoadState } from "./viewer-stage";

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

/** Widgets that use arrow keys / Escape themselves (a focused <video> seeks with arrows). */
const KEY_OWNING_WIDGETS = "[role=slider],[role=radiogroup],[role=toolbar],[role=tablist],[role=listbox],[role=grid],[role=application]";

function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "VIDEO", "AUDIO"].includes(target.tagName)) return true;
  return target.closest(KEY_OWNING_WIDGETS) !== null;
}

/** Overlays (dialogs, menus) own the keyboard while open. */
function overlayOpen(): boolean {
  return Boolean(document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]"));
}

/** Small price tag on an action ("2" credits, or "Free"); the full text is the button's description. */
function CostTag({ credits, from = false }: { credits: number; from?: boolean }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground tabular-nums">
      {credits > 0 && <CoinsIcon className="size-3" />}
      {credits > 0 ? `${credits}${from ? "+" : ""}` : "Free"}
    </span>
  );
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
  const patchLists = useCachedListPatcher();
  const [media, setMedia] = React.useState(initial);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState<Zoom | null>(null);
  const [loadState, setLoadState] = React.useState<StageLoadState>("ok");
  const [downloading, setDownloading] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Talking videos speak their script (stored as the media prompt): caption it. Other clips are silent.
  useScriptCaptions(videoRef, details.jobType === "talking_video" ? media.prompt : null, media.durationSec);

  // A refresh (expired signed URLs) brings new URLs for the same item: take them, keep local edits.
  const [seenInitial, setSeenInitial] = React.useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setMedia((cur) => ({ ...cur, url: initial.url, thumbUrl: initial.thumbUrl, downloadUrl: initial.downloadUrl }));
    setLoadState("ok");
  }
  // When the current signed URLs were issued (they last at least an hour).
  const urlsIssuedAt = React.useRef(0);
  React.useEffect(() => {
    urlsIssuedAt.current = Date.now();
  }, [initial]);

  const listKey = serializeGalleryFilters(filters);
  const backHref = galleryHref(filters);
  const prevHref = prevId ? viewerHref(prevId, filters) : null;
  const nextHref = nextId ? viewerHref(nextId, filters) : null;
  const isImage = media.kind === "image";

  React.useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
  }, [router, prevHref, nextHref]);

  // Keep focus on the arrow button used to get here (the page is recreated per photo).
  const prevRef = React.useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  const nextRef = React.useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  React.useEffect(() => {
    const wanted = takeNavFocus();
    if (!wanted) return;
    const [first, second] = wanted === "next" ? [nextRef, prevRef] : [prevRef, nextRef];
    // At the end of the list the used button is disabled: fall back to the other one.
    const target = [first.current, second.current].find((el) => el && !el.hasAttribute("disabled"));
    target?.focus();
  }, []);

  const goTo = React.useCallback(
    (direction: NavDirection) => {
      const href = direction === "prev" ? prevHref : nextHref;
      // Replace: browsing photos doesn't pile up history, so Back returns to the gallery.
      if (href) router.replace(href, { scroll: false });
    },
    [router, prevHref, nextHref],
  );

  /** Back to the gallery, which scrolls to (and focuses) the photo you were on. */
  const rememberReturn = React.useCallback(
    () => rememberGalleryReturn(sessionStore(), listKey, initial.id),
    [listKey, initial.id],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target) || overlayOpen()) return;
      if ((e.key === "ArrowLeft" && prevHref) || (e.key === "ArrowRight" && nextHref)) {
        // Focus on an arrow button stays on it.
        const active = document.activeElement;
        if (active && active === prevRef.current) requestNavFocus("prev");
        else if (active && active === nextRef.current) requestNavFocus("next");
        goTo(e.key === "ArrowLeft" ? "prev" : "next");
      }
      else if (e.key === "Escape" && zoom) setZoom(null);
      else if (e.key === "Escape") {
        rememberReturn();
        router.push(backHref, { scroll: false });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref, backHref, goTo, zoom, rememberReturn]);

  const fail = (err: unknown) => {
    if (err instanceof ApiClientError && err.code === "not_found") {
      // Deleted elsewhere (another tab or device): say so and leave.
      toast.error(media.kind === "video" ? "This video was deleted" : "This photo was deleted");
      patchLists(media, null);
      router.replace(backHref, { scroll: false });
      return;
    }
    toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));
  };

  async function patch(body: Partial<Pick<MediaDTO, "isFavorite" | "folderId" | "hidden">>, success?: string) {
    const before = media;
    setMedia({ ...media, ...body });
    try {
      const { media: saved } = await api<{ media: MediaDTO }>(`/api/media/${media.id}`, { method: "PATCH", body });
      // Keep the current signed URLs so the image doesn't reload.
      setMedia((cur) => ({ ...cur, isFavorite: saved.isFavorite, folderId: saved.folderId, hidden: saved.hidden }));
      // The gallery list (cached in memory) shows the change when you go back.
      patchLists(before, saved);
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
    patchLists(media, null);
    toast.success(media.kind === "video" ? "Video deleted" : "Photo deleted");
    void mutateFolders();
    router.replace(nextHref ?? prevHref ?? backHref, { scroll: false });
  }

  /** Signed URLs expire: after a long stay on this page, fetch a fresh download link first. */
  async function download(e: React.MouseEvent<HTMLAnchorElement>) {
    if (Date.now() - urlsIssuedAt.current < SIGNED_URL_REFRESH_MS) return; // the link is fine
    e.preventDefault();
    setDownloading(true);
    try {
      const { media: fresh } = await api<{ media: MediaDTO }>(`/api/media/${media.id}`);
      setMedia((cur) => ({ ...cur, url: fresh.url, thumbUrl: fresh.thumbUrl, downloadUrl: fresh.downloadUrl }));
      urlsIssuedAt.current = Date.now();
      const a = document.createElement("a");
      a.href = fresh.downloadUrl;
      a.download = "";
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
    } catch (err) {
      fail(err);
    } finally {
      setDownloading(false);
    }
  }

  /** The photo didn't load (usually a signed URL that expired while the page sat open): refresh once. */
  const onLoadError = () => {
    if (loadState !== "ok") return setLoadState("failed");
    setLoadState("retrying");
    router.refresh();
  };

  const created = new Date(media.createdAt);
  const lineageLabel = (details.jobType && LINEAGE_LABEL[details.jobType]) ?? "Made from";
  const kindWord = media.kind === "video" ? "video" : "photo";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only" suppressHydrationWarning>
        {media.kind === "video" ? "Video" : "Photo"} from{" "}
        {created.toLocaleDateString(t.locale, { dateStyle: "medium" })}
      </h1>
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref} scroll={false} onClick={rememberReturn}>
            <ArrowLeftIcon aria-hidden="true" />
            {t("nav.gallery")}
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground pointer-fine:lg:block" aria-hidden="true">
            <kbd className="font-sans">←</kbd> <kbd className="font-sans">→</kbd> to browse ·{" "}
            <kbd className="font-sans">Esc</kbd> to go back
          </p>
          <nav aria-label="Browse" className="flex items-center gap-1">
            <NavButton
              ref={prevRef}
              href={prevHref}
              label="Previous (newer)"
              icon={<ChevronLeftIcon />}
              onNavigate={() => requestNavFocus("prev")}
            />
            <NavButton
              ref={nextRef}
              href={nextHref}
              label="Next (older)"
              icon={<ChevronRightIcon />}
              onNavigate={() => requestNavFocus("next")}
            />
          </nav>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ViewerStage
          media={media}
          videoRef={videoRef}
          zoom={zoom}
          onZoomChange={setZoom}
          onSwipe={goTo}
          loadState={loadState}
          onLoadError={onLoadError}
          onRetry={() => {
            setLoadState("retrying");
            router.refresh();
          }}
        >
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
        </ViewerStage>

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
              <a href={media.downloadUrl} download onClick={(e) => void download(e)} aria-busy={downloading || undefined}>
                {downloading ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                ) : (
                  <DownloadIcon aria-hidden="true" />
                )}
                {t("common.download")}
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={() => setShareOpen(true)} aria-describedby="viewer-cost-share">
              <Share2Icon aria-hidden="true" />
              {t("common.share")}
              <CostTag credits={0} />
            </Button>
          </div>

          {isImage && (
            <section aria-labelledby="viewer-create" className="flex flex-col gap-2">
              <h2 id="viewer-create" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Create from this
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/edit/${media.id}`} aria-describedby="viewer-cost-edit">
                    <PencilIcon aria-hidden="true" />
                    {t("common.edit")}
                    <CostTag credits={VIEWER_TOOL_COSTS.edit} from />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/video?mediaId=${encodeURIComponent(media.id)}`} aria-describedby="viewer-cost-video">
                    <ClapperboardIcon aria-hidden="true" />
                    Make video
                    <CostTag credits={VIEWER_TOOL_COSTS.video} from />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/try-on?mediaId=${encodeURIComponent(media.id)}`} aria-describedby="viewer-cost-try-on">
                    <ShirtIcon aria-hidden="true" />
                    Try on
                    <CostTag credits={VIEWER_TOOL_COSTS.tryOn} />
                  </Link>
                </Button>
              </div>
              <h3 className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <SparklesIcon aria-hidden="true" className="size-3.5" />
                Enhance in one click
              </h3>
              <EnhanceQuickActions media={media} labeled />
              <p className="text-xs text-muted-foreground">Prices are in credits and charged only when you start.</p>
            </section>
          )}

          {isImage && details.jobType === "generate" && <ViewerRemix key={media.id} media={media} />}

          {/* Descriptions for the price tags above (screen readers hear "Edit, from 2 credits"). */}
          <div className="sr-only">
            <span id="viewer-cost-share">Free</span>
            <span id="viewer-cost-edit">{creditsLabel(VIEWER_TOOL_COSTS.edit, { from: true })}</span>
            <span id="viewer-cost-video">{creditsLabel(VIEWER_TOOL_COSTS.video, { from: true })}</span>
            <span id="viewer-cost-try-on">{creditsLabel(VIEWER_TOOL_COSTS.tryOn)}</span>
          </div>

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
              title={`Delete this ${kindWord}?`}
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
        noun={kindWord}
      />
    </div>
  );
}

function NavButton({
  ref,
  href,
  label,
  icon,
  onNavigate,
}: {
  ref: React.Ref<HTMLAnchorElement & HTMLButtonElement>;
  href: string | null;
  label: string;
  icon: React.ReactNode;
  onNavigate: () => void;
}) {
  if (!href) {
    return (
      <Button ref={ref} type="button" variant="outline" size="icon-sm" disabled aria-label={label}>
        {icon}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon-sm">
      <Link
        ref={ref}
        href={href}
        replace
        scroll={false}
        aria-label={label}
        title={`${label} — arrow key`}
        onClick={onNavigate}
      >
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
            <dd className="min-w-0 text-right break-words">{value}</dd>
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
