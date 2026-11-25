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
  LoaderCircleIcon,
  PencilIcon,
  Share2Icon,
  ShirtIcon,
  SunMediumIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyButton } from "@/components/app/copy-button";
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
import { PencilDot, captionDate } from "./marks";
import { MoveToFolderMenu } from "./move-to-folder-menu";
import { CreditReadout, LeaderRow, MONO_LABEL } from "./readout";
import { ShareDialog } from "./share-dialog";
import { useCachedListPatcher, useFolders } from "./use-gallery";
import { VIEWER_TOOL_COSTS, creditsLabel } from "./viewer-actions";
import { requestNavFocus, takeNavFocus, type NavDirection, type Zoom } from "./viewer-gestures";
import { ViewerRemix } from "./viewer-remix";
import { ViewerStage, type StageLoadState } from "./viewer-stage";
import { INITIAL_VIEWER_LOAD, viewerLoadStep, type ViewerLoad, type ViewerLoadEvent } from "./viewer-load";

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
const KEY_OWNING_WIDGETS =
  "[role=slider],[role=radiogroup],[role=toolbar],[role=tablist],[role=listbox],[role=grid],[role=application]";

function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "VIDEO", "AUDIO"].includes(target.tagName))
    return true;
  return target.closest(KEY_OWNING_WIDGETS) !== null;
}

/** Overlays (dialogs, menus) own the keyboard while open. */
function overlayOpen(): boolean {
  return Boolean(document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]"));
}

/** Price readout on an action ("2+ CR", or "FREE"); the full text is the button's description. */
function CostTag({ credits, from = false }: { credits: number; from?: boolean }) {
  return <CreditReadout credits={credits} from={from} />;
}

/** Short frame reference for edge print and titles: the last 4 characters of the id. */
function frameRef(id: string): string {
  return id.slice(-4).toUpperCase();
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
  const [load, setLoad] = React.useState<ViewerLoad>(INITIAL_VIEWER_LOAD);
  const loadState: StageLoadState = load.phase;
  const onLoadEvent = (event: ViewerLoadEvent) => {
    const step = viewerLoadStep(load, event);
    if (step.state !== load) setLoad(step.state);
    if (step.refresh) router.refresh();
  };
  const [downloading, setDownloading] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Talking videos speak their script (stored as the media prompt): caption it. Other clips are silent.
  useScriptCaptions(videoRef, details.jobType === "talking_video" ? media.prompt : null, media.durationSec);

  // A refresh (expired signed URLs) brings new URLs for the same item: take them, keep local edits.
  const [seenInitial, setSeenInitial] = React.useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setMedia((cur) => ({ ...cur, url: initial.url, thumbUrl: initial.thumbUrl, downloadUrl: initial.downloadUrl }));
    setLoad((cur) => viewerLoadStep(cur, { type: "data", sameItem: initial.id === seenInitial.id }).state);
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
      } else if (e.key === "Escape" && zoom) setZoom(null);
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

  /** The photo didn't load (usually a signed URL that expired while the page sat open): see viewerLoadStep. */
  const onLoadError = () => onLoadEvent({ type: "error" });

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
          <p
            className="hidden font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase pointer-fine:lg:block"
            aria-hidden="true"
          >
            <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> browse ·{" "}
            <kbd className="font-mono">Esc</kbd> back
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
          loadKey={load.key}
          onLoadError={onLoadError}
          onLoaded={() => onLoadEvent({ type: "loaded" })}
          onRetry={() => onLoadEvent({ type: "retry" })}
        >
          {media.hidden && (
            <span className="mono-caps absolute bottom-3 left-3 border border-foreground/20 bg-card px-2 py-1.5 text-foreground">
              Hidden
            </span>
          )}
          <figcaption className="sr-only">
            {media.kind === "video" ? "AI-generated video" : "AI-generated photo"}, created{" "}
            {created.toLocaleString(t.locale)}
          </figcaption>
        </ViewerStage>

        <aside className="flex flex-col gap-6" aria-label="Details and actions">
          {/* Edge print for this frame: reference, date and size, like the rebate of a negative. */}
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-foreground/15 pb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
            <span className="text-foreground">
              <span aria-hidden="true" className="text-safelight-ink">
                ▸{" "}
              </span>
              {media.kind === "video" ? "Clip" : "Frame"} {frameRef(media.id)}
            </span>
            <span>{captionDate(media.createdAt)}</span>
            {media.width && media.height && (
              <span>
                {media.width}×{media.height}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              aria-pressed={media.isFavorite}
              onClick={() => void patch({ isFavorite: !media.isFavorite })}
              className={cn(media.isFavorite && "border-safelight-ink/60")}
            >
              {media.isFavorite ? <PencilDot className="size-3.5" /> : <HeartIcon aria-hidden="true" />}
              {media.isFavorite ? "Favorited" : "Favorite"}
            </Button>
            <Button asChild variant="outline">
              <a
                href={media.downloadUrl}
                download
                onClick={(e) => void download(e)}
                aria-busy={downloading || undefined}
              >
                {downloading ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                ) : (
                  <DownloadIcon aria-hidden="true" />
                )}
                {t("common.download")}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShareOpen(true)}
              aria-describedby="viewer-cost-share"
            >
              <Share2Icon aria-hidden="true" />
              {t("common.share")}
              <CostTag credits={0} />
            </Button>
          </div>

          {isImage && (
            <section aria-labelledby="viewer-create" className="flex flex-col gap-2.5">
              <h2 id="viewer-create" className={MONO_LABEL}>
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
                  <Link
                    href={`/app/video?mediaId=${encodeURIComponent(media.id)}`}
                    aria-describedby="viewer-cost-video"
                  >
                    <ClapperboardIcon aria-hidden="true" />
                    Make video
                    <CostTag credits={VIEWER_TOOL_COSTS.video} from />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/app/try-on?mediaId=${encodeURIComponent(media.id)}`}
                    aria-describedby="viewer-cost-try-on"
                  >
                    <ShirtIcon aria-hidden="true" />
                    Try on
                    <CostTag credits={VIEWER_TOOL_COSTS.tryOn} />
                  </Link>
                </Button>
              </div>
              <h3 className="mt-2 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                <SunMediumIcon aria-hidden="true" className="size-3.5" />
                Enhance in one click
              </h3>
              <EnhanceQuickActions media={media} labeled className="gap-2" />
              <p className="text-xs text-muted-foreground">
                Prices are in credits (<span className="font-mono">CR</span>) and charged only when you start.
              </p>
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

          <div className="border-t border-foreground/15" />

          <MediaDetails media={media} details={details} />

          {parent && (
            <section aria-labelledby="viewer-parent" className="flex flex-col gap-2">
              <h2 id="viewer-parent" className={MONO_LABEL}>
                {lineageLabel}
              </h2>
              <PrintThumb media={parent} className="w-28" />
            </section>
          )}

          {childMedia.length > 0 && (
            <section aria-labelledby="viewer-children" className="flex flex-col gap-2">
              <h2 id="viewer-children" className={MONO_LABEL}>
                Versions made from this
              </h2>
              <ul className="grid grid-cols-4 gap-2">
                {childMedia.map((c) => (
                  <li key={c.id}>
                    <PrintThumb media={c} />
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

/** A light-meter scale: ticks every 10%, a safelight needle at the reading. */
function ScoreMeter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-sm tracking-normal text-foreground tabular-nums">{pct}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        title={hint}
        className="relative h-3 border-b border-foreground/40"
      >
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn("absolute bottom-0 w-px bg-foreground/35", i % 5 === 0 ? "h-3" : "h-1.5")}
            style={{ left: `${i * 10}%` }}
          />
        ))}
        <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.5 bg-safelight-ink" style={{ width: `${pct}%` }} />
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 h-4 w-0.5 -translate-x-1/2 bg-safelight-ink"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A small print of a related photo (lineage), linking to it in the viewer. */
function PrintThumb({ media, className }: { media: MediaDTO; className?: string }) {
  const alt = media.prompt ? media.prompt.slice(0, 140) : media.kind === "video" ? "Video" : "Photo";
  return (
    <Link
      href={viewerHref(media.id, {})}
      aria-label={alt}
      className={cn("block border border-foreground/10 bg-card p-1 pb-0", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer */}
      <img src={media.thumbUrl || media.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
      <span aria-hidden="true" className="flex h-5 items-center font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
        ▸ {frameRef(media.id)}
      </span>
    </Link>
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
      <Link key="pack" href={`/app/packs/${details.packSlug}`} className="underline underline-offset-4">
        {details.packName ?? details.packSlug}
      </Link>,
    ]);
  }
  if (details.batchId) {
    rows.push([
      "Batch",
      <Link key="batch" href={`/app/batches/${details.batchId}`} className="underline underline-offset-4">
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
  if (media.width && media.height)
    rows.push([
      "Resolution",
      <span key="res" className="font-mono text-xs tabular-nums">
        {media.width} × {media.height}
      </span>,
    ]);
  if (media.durationSec != null)
    rows.push([
      "Duration",
      <span key="dur" className="font-mono text-xs tabular-nums">
        {Math.round(media.durationSec)}s
      </span>,
    ]);
  if (details.seed != null)
    rows.push([
      "Seed",
      <span key="seed" className="font-mono text-xs">
        {details.seed}
      </span>,
    ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Lab stamps. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono-caps border border-foreground/30 px-2 py-1.5 text-foreground">AI-generated</span>
        {media.isDraft && (
          <span className="mono-caps border border-dashed border-foreground/30 px-2 py-1.5 text-muted-foreground">
            {t("media.draft")}
          </span>
        )}
      </div>

      {media.prompt && (
        <section aria-labelledby="viewer-prompt" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="viewer-prompt" className={MONO_LABEL}>
              Prompt
            </h2>
            <CopyButton value={media.prompt} toastMessage="Prompt copied" variant="ghost" />
          </div>
          <p className="text-sm leading-relaxed break-words whitespace-pre-line">{media.prompt}</p>
        </section>
      )}

      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value]) => (
          <LeaderRow key={label} label={label}>
            {value}
          </LeaderRow>
        ))}
      </dl>

      {media.scores && (media.scores.likeness != null || media.scores.quality != null) && (
        <section aria-labelledby="viewer-scores" className="flex flex-col gap-3">
          <h2 id="viewer-scores" className={MONO_LABEL}>
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
