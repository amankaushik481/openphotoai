"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { MediaGrid } from "@/components/app/media-grid";
import { useErrorToast } from "@/components/create/api-error-alert";
import { downloadMediaZip } from "@/components/create/download";
import {
  batchAnnouncement,
  batchProgress,
  collectJobMedia,
  describeApiError,
  plural,
  splitBestShots,
} from "@/components/create/logic";
import { PackSwatch } from "@/components/create/pack-quick-picker";
import { useBatch } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import type { BatchStatus, MediaDTO } from "@/types/domain";
import type { PackSummary } from "@/types/pack";

export interface BatchProgressViewProps {
  batchId: string;
  pack: Pick<PackSummary, "slug" | "name" | "emoji" | "colors"> | null;
  /** Images originally requested when credits ran out part-way (from `?requested=`). */
  requested?: number;
}

const STATUS_LABEL: Record<BatchStatus, string> = {
  running: "In progress",
  completed: "Finished",
  failed: "Failed",
  canceled: "Canceled",
};

/** `/app/batches/[id]`: live progress, results filling in best-first, download + gallery links. */
export function BatchProgressView({ batchId, pack, requested }: BatchProgressViewProps) {
  const showError = useErrorToast();
  const { mutate: refreshMe } = useMe();
  const { batch, jobs, error, isLoading, isTerminal } = useBatch(batchId, { onTerminal: () => void refreshMe() });
  const [favorites, setFavorites] = React.useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const media = React.useMemo(
    () => collectJobMedia(jobs).map((m) => (Object.hasOwn(favorites, m.id) ? { ...m, isFavorite: favorites[m.id]! } : m)),
    [jobs, favorites],
  );
  const { shown, hidden } = React.useMemo(() => splitBestShots(media), [media]);
  const visible = showAll ? [...shown, ...hidden] : shown;

  if (error && !batch) {
    const e = describeApiError(error, { nextPath: `/app/batches/${batchId}` });
    return (
      <EmptyState
        icon={<ImagesIcon />}
        title={e.code === "not_found" ? "Batch not found" : e.title}
        description={e.code === "not_found" ? "It may have been deleted, or it belongs to another account." : e.message}
        action={
          <Button asChild variant="outline">
            <Link href="/app/packs">Browse packs</Link>
          </Button>
        }
      />
    );
  }

  if (!batch) {
    return (
      <div className="flex flex-col gap-4" aria-busy={isLoading}>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const progress = batchProgress(batch, jobs);
  const pending = Math.max(0, progress.total - progress.done);
  const shortBy = requested && requested > batch.total ? requested - batch.total : 0;

  async function toggleFavorite(item: MediaDTO, next: boolean) {
    setFavorites((prev) => ({ ...prev, [item.id]: next }));
    try {
      await api(`/api/media/${item.id}`, { method: "PATCH", body: { isFavorite: next } });
    } catch (err) {
      setFavorites((prev) => ({ ...prev, [item.id]: !next }));
      showError(err);
    }
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      await downloadMediaZip(
        visible.map((m) => m.id),
        `${pack?.slug ?? "batch"}-${batchId.slice(-8)}.zip`,
      );
    } catch (err) {
      showError(err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="batch-title" className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="flex items-start gap-3">
          {pack && <PackSwatch pack={pack} className="size-12 text-2xl" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="batch-title" className="font-display text-2xl leading-tight tracking-tight sm:text-3xl">
                {pack ? pack.name : "Batch"}
              </h1>
              <Badge variant={batch.status === "running" ? "soft" : batch.status === "completed" ? "success" : "destructive"}>
                {batch.status === "running" && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
                {STATUS_LABEL[batch.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {progress.total} {plural(progress.total, "photo")} · started{" "}
              {new Date(batch.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium tabular-nums">
              {progress.done} of {progress.total} done
            </span>
            <span className="text-muted-foreground tabular-nums">{progress.percent}%</span>
          </div>
          <Progress
            value={progress.percent}
            aria-label="Batch progress"
            aria-valuetext={`${progress.done} of ${progress.total} done`}
            indicatorClassName={!isTerminal ? "bg-brand-gradient" : undefined}
          />
          {progress.failed > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <RotateCcwIcon aria-hidden="true" className="size-3.5 shrink-0" />
              {progress.failed} {plural(progress.failed, "photo")} failed or {plural(progress.failed, "was", "were")} blocked
              {progress.refunded > 0
                ? ` — ${progress.refunded} ${plural(progress.refunded, "credit was", "credits were")} refunded automatically.`
                : ". Their credits are refunded automatically."}
            </p>
          )}
        </div>

        {shortBy > 0 && (
          <Alert variant="warning">
            <AlertTitle>Started {batch.total} of {requested} photos</AlertTitle>
            <AlertDescription>
              <p>You ran out of credits for the other {shortBy}. Top up and run the pack again for more.</p>
              <Button asChild size="sm" variant="brand" className="mt-1">
                <Link href="/app/billing">Buy credits</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={downloadAll} disabled={downloading || visible.length === 0}>
            {downloading ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />}
            {downloading ? "Preparing zip…" : `Download all (${visible.length})`}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/gallery?batchId=${encodeURIComponent(batchId)}`}>
              <ImagesIcon aria-hidden="true" />
              Open in gallery
            </Link>
          </Button>
          {pack && isTerminal && (
            <Button asChild variant="ghost">
              <Link href={`/app/packs/${pack.slug}`}>
                <SparklesIcon aria-hidden="true" />
                Run this pack again
              </Link>
            </Button>
          )}
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {batchAnnouncement(progress, isTerminal)}
        </p>
      </section>

      <section aria-labelledby="batch-results" className="@container flex flex-col gap-3">
        <h2 id="batch-results" className="text-lg font-semibold">
          Photos{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {shown.length} best {plural(shown.length, "shot")}
            {hidden.length > 0 ? ` · ${hidden.length} hidden` : ""}
          </span>
        </h2>

        {visible.length > 0 && (
          <MediaGrid
            media={visible}
            showHidden
            onToggleFavorite={toggleFavorite}
            renderActions={(m) => (
              <Button asChild size="icon-sm" variant="secondary" className="size-7">
                <Link href={`/app/edit/${m.id}`} aria-label="Edit this photo">
                  <PencilIcon className="size-3.5" />
                </Link>
              </Button>
            )}
          />
        )}

        {pending > 0 && (
          <ul
            className="grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5"
            aria-label={`${pending} ${plural(pending, "photo")} still in progress`}
          >
            {Array.from({ length: Math.min(pending, 10) }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              </li>
            ))}
          </ul>
        )}

        {hidden.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? <ChevronUpIcon /> : <ChevronDownIcon />}
            {showAll ? "Show fewer" : `Show ${hidden.length} more`}
          </Button>
        )}

        {isTerminal && media.length === 0 && (
          <EmptyState
            size="sm"
            icon={<ImagesIcon />}
            title="No photos from this batch"
            description="Every photo failed or was blocked, and all credits were refunded. Try again or pick another pack."
          />
        )}
      </section>
    </div>
  );
}
