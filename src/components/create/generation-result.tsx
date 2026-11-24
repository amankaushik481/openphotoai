"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PencilIcon,
  SquareIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobProgress, JobStatusBadge } from "@/components/app/job-progress";
import { MediaGrid } from "@/components/app/media-grid";
import { useErrorToast } from "@/components/create/api-error-alert";
import {
  expectedImages,
  generateCost,
  plural,
  splitBestShots,
  type IdentityMode,
} from "@/components/create/logic";
import type { RerenderState } from "@/components/create/use-generation-session";
import { useJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface GenerationResultProps {
  /** The job as returned by POST /api/jobs (rendered instantly, then polled). */
  job: JobDTO;
  title: string;
  modelModes: Readonly<Record<string, IdentityMode>>;
  rerenders: Readonly<Record<string, RerenderState>>;
  onFullQuality: (draft: MediaDTO, job: JobDTO) => void;
  onTerminal?: (job: JobDTO, title: string) => void;
  onDismiss?: (jobId: string) => void;
  className?: string;
}

/** One job of the session: live progress, then results best-first with weaker shots folded away. */
export function GenerationResult({
  job: initialJob,
  title,
  modelModes,
  rerenders,
  onFullQuality,
  onTerminal,
  onDismiss,
  className,
}: GenerationResultProps) {
  const headingId = React.useId();
  const showError = useErrorToast();
  const { job: polled, cancel } = useJob(initialJob.id, {
    fallbackJob: initialJob,
    onTerminal: (j) => onTerminal?.(j, title),
  });
  const job = polled ?? initialJob;
  const [favorites, setFavorites] = React.useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = React.useState(false);
  const [canceling, setCanceling] = React.useState(false);

  const media = React.useMemo(
    () => job.media.map((m) => (Object.hasOwn(favorites, m.id) ? { ...m, isFavorite: favorites[m.id]! } : m)),
    [job.media, favorites],
  );
  const { shown, hidden } = React.useMemo(() => splitBestShots(media), [media]);
  const inFlight = job.status === "queued" || job.status === "running";
  const pending = inFlight ? Math.max(0, expectedImages(job) - job.media.length) : 0;
  const placeholderRatio = job.input.type === "generate" && job.input.aspectRatio ? job.input.aspectRatio.replace(":", " / ") : "4 / 5";

  async function toggleFavorite(item: MediaDTO, next: boolean) {
    setFavorites((prev) => ({ ...prev, [item.id]: next }));
    try {
      await api(`/api/media/${item.id}`, { method: "PATCH", body: { isFavorite: next } });
    } catch (err) {
      setFavorites((prev) => ({ ...prev, [item.id]: !next }));
      showError(err);
    }
  }

  async function onCancel() {
    setCanceling(true);
    try {
      await cancel();
    } catch (err) {
      showError(err);
    } finally {
      setCanceling(false);
    }
  }

  function renderActions(m: MediaDTO) {
    const state = rerenders[m.id];
    const cost = generateCost({
      quality: "standard",
      numImages: 1,
      fromDraft: true,
      mode: m.modelId ? modelModes[m.modelId] : undefined,
    });
    return (
      <>
        {m.isDraft && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-xs"
            disabled={state !== undefined}
            onClick={() => onFullQuality(m, job)}
            aria-label={
              // The name starts with the visible text (label in name, WCAG 2.5.3).
              state === "started"
                ? "Rendering full-quality version"
                : `Render this draft at full quality (${cost} ${plural(cost, "credit")})`
            }
          >
            {state === "pending" ? (
              <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <WandSparklesIcon aria-hidden="true" className="size-3.5" />
            )}
            {state === "started" ? "Rendering" : "Full quality"}
          </Button>
        )}
        <Button asChild size="icon-sm" variant="secondary" className="size-7">
          <Link href={`/app/edit/${m.id}`} aria-label="Edit this photo">
            <PencilIcon className="size-3.5" />
          </Link>
        </Button>
      </>
    );
  }

  const visible = showAll ? [...shown, ...hidden] : shown;

  return (
    <article
      aria-labelledby={headingId}
      className={cn("@container flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs sm:p-4", className)}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={headingId} className="truncate text-sm font-medium">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{describeJob(job)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {job.status === "succeeded" && <JobStatusBadge status={job.status} />}
          {inFlight && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={canceling} className="h-7 px-2 text-xs">
              <SquareIcon aria-hidden="true" className="size-3" />
              Cancel
            </Button>
          )}
          {onDismiss && !inFlight && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-7"
              onClick={() => onDismiss(job.id)}
              aria-label={`Remove "${title}" from this list`}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </header>

      {job.status !== "succeeded" && <JobProgress job={job} title={progressTitle(job)} bare />}
      {job.status === "succeeded" && job.blockedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {job.blockedCount} {plural(job.blockedCount, "result was", "results were")} blocked by our safety filter and never
          stored{job.creditsRefunded > 0 ? ` — ${job.creditsRefunded} ${plural(job.creditsRefunded, "credit")} refunded` : ""}.
        </p>
      )}

      {visible.length > 0 && (
        <MediaGrid
          media={visible}
          showHidden
          onToggleFavorite={toggleFavorite}
          renderActions={renderActions}
          priorityCount={2}
        />
      )}

      {pending > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3" aria-label="Photos in progress">
          {Array.from({ length: pending }, (_, i) => (
            <li key={i}>
              <Skeleton className="w-full rounded-lg" style={{ aspectRatio: placeholderRatio }} />
            </li>
          ))}
        </ul>
      )}

      {(hidden.length > 0 || job.status === "succeeded") && (
        <footer className="flex flex-wrap items-center justify-between gap-2">
          {hidden.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="-ml-2"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? <ChevronUpIcon /> : <ChevronDownIcon />}
              {showAll ? "Show fewer" : `Show ${hidden.length} more`}
            </Button>
          ) : (
            <span />
          )}
          {job.status === "succeeded" && (
            <Button asChild size="sm" variant="link" className="px-0">
              <Link href="/app/gallery">
                <ImagesIcon />
                Open gallery
              </Link>
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}

function progressTitle(job: JobDTO): string {
  if (job.status === "queued") return "Waiting for a free slot…";
  if (job.status === "running") return "Creating your photos…";
  return "Generation";
}

/** "4 drafts · 4:5" / "1 standard photo · re-render". */
function describeJob(job: JobDTO): string {
  const input = job.input;
  if (input.type !== "generate") return "";
  const n = expectedImages(job);
  const kind = input.quality === "draft" ? plural(n, "draft") : `${input.quality} ${plural(n, "photo")}`;
  const parts = [`${n} ${kind}`];
  if (input.fromDraftMediaId) parts.push("re-render of a draft");
  else parts.push(input.aspectRatio);
  if (job.creditsCharged > 0) parts.push(`${job.creditsCharged} ${plural(job.creditsCharged, "credit")}`);
  return parts.join(" · ");
}
