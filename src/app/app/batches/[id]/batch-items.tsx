"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDownIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { newIdempotencyKey } from "@/components/create/logic";
import { PencilCross, frameNumber } from "@/components/gallery/marks";
import { CreditReadout } from "@/components/gallery/readout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isTerminalStatus } from "@/hooks/job-status";
import { useBatch, useJobs } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, api } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { cn } from "@/lib/utils";
import type { JobDTO } from "@/types/domain";
import {
  batchItemState,
  batchItemTitle,
  darkroomStatus,
  retryCost,
  retryRequest,
  type BatchItemKind,
} from "./batch-items-logic";

/** Status chip colours: safelight for trouble and for the lamp that's on while developing. */
const CHIP: Record<BatchItemKind, string> = {
  waiting: "border-foreground/20 text-muted-foreground",
  running: "border-safelight-ink/50 text-safelight-ink",
  done: "border-success/40 text-success",
  partial: "border-foreground/25 text-foreground",
  failed: "border-safelight-ink/60 text-safelight-ink",
  blocked: "border-safelight-ink/60 text-safelight-ink",
  canceled: "border-foreground/20 text-muted-foreground",
};

function creditsText(n: number): string {
  return n === 0 ? "free" : n === 1 ? "1 credit" : `${n} credits`;
}

/**
 * `/app/batches/[id]`, below the results: every photo of the batch with its own status, refunds for
 * the ones that failed or were blocked, and a retry for failures (same pack prompt, new seed).
 */
export function BatchItems({ batchId, promptTitles }: { batchId: string; promptTitles: readonly string[] }) {
  const { jobs, isTerminal } = useBatch(batchId);
  const { mutate: refreshMe } = useMe();
  // Retries are new jobs outside the batch: tracked here, by the job they replace.
  const [retries, setRetries] = React.useState<Record<string, JobDTO>>({});
  const [submitting, setSubmitting] = React.useState<string | "all" | null>(null);
  const retryIds = React.useMemo(() => Object.values(retries).map((j) => j.id), [retries]);
  const { jobs: retryJobs } = useJobs(retryIds, { onAllTerminal: () => void refreshMe() });
  const retryById = React.useMemo(() => new Map(retryJobs.map((j) => [j.id, j])), [retryJobs]);

  const latestRetry = (job: JobDTO) => {
    const r = retries[job.id];
    return r ? (retryById.get(r.id) ?? r) : null;
  };
  // Failed photos whose retry (if any) failed too can be tried again.
  const canRetry = (job: JobDTO) => batchItemState(job).canRetry && (latestRetry(job)?.status ?? "failed") === "failed";
  const failed = jobs.filter(canRetry);
  const problems = jobs.filter((j) => j.status === "failed" || j.status === "blocked").length;
  const [open, setOpen] = React.useState<boolean | null>(null);
  // Open by default while photos are still coming or when something went wrong.
  const expanded = open ?? (!isTerminal || problems > 0);

  async function retry(list: JobDTO[], which: string | "all") {
    setSubmitting(which);
    let started = 0;
    try {
      for (const job of list) {
        const request = retryRequest(job);
        if (!request) continue;
        const { job: created } = await api<{ job: JobDTO }>("/api/jobs", {
          method: "POST",
          body: request,
          // A fresh key per click: the server keeps keys forever, so a key derived from the job (and a
          // counter that restarts on reload) handed back an earlier failed retry instead of a new job.
          // Double clicks are covered by `submitting`.
          headers: { "Idempotency-Key": newIdempotencyKey() },
        });
        started++;
        setRetries((prev) => ({ ...prev, [job.id]: created }));
      }
      if (started) toast.success(started === 1 ? "Trying that photo again" : `Trying ${started} photos again`);
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : undefined;
      const text = err instanceof ApiClientError ? err.message || errorMessage(code) : errorMessage(undefined);
      toast.error(started ? `Started ${started}; the rest didn't start: ${text}` : text);
    } finally {
      setSubmitting(null);
      void refreshMe();
    }
  }

  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="batch-items-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-foreground/15 pb-2">
        <h2 id="batch-items-title" className="font-display text-2xl font-normal tracking-tight sm:text-3xl">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="batch-items-list"
            onClick={() => setOpen(!expanded)}
            className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm text-left"
          >
            Each photo
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
              {jobs.length} frames ·{" "}
              {problems > 0 ? `${problems} didn't work` : isTerminal ? "all done" : "in progress"}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </button>
        </h2>
        {failed.length > 1 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void retry(failed, "all")}
            disabled={submitting !== null}
          >
            {submitting === "all" ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <RotateCcwIcon aria-hidden="true" />
            )}
            Retry {failed.length} failed
            <span className="sr-only"> · {creditsText(retryCost(failed))}</span>
            <CreditReadout credits={retryCost(failed)} />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="@container">
          <ul
            id="batch-items-list"
            className="grid grid-cols-2 gap-x-3 gap-y-4 @md:grid-cols-4 @3xl:grid-cols-6 @6xl:grid-cols-8"
          >
            {jobs.map((job, i) => {
              const state = batchItemState(job);
              const title = batchItemTitle(job, i, promptTitles);
              const thumb = job.media[0];
              const retryJob = latestRetry(job);
              const retryState = retryJob ? batchItemState(retryJob) : null;
              const trouble = state.kind === "failed" || state.kind === "blocked" || (state.kind === "partial" && !thumb);
              return (
                <li key={job.id} className="flex min-w-0 flex-col border border-foreground/10 bg-card p-1.5 pb-2">
                  {/* The frame: the print, the developer tray (with the safelight on), or a crossed-out blank. */}
                  <div
                    className={cn(
                      "relative aspect-[4/5] overflow-hidden",
                      thumb ? "bg-muted" : state.kind === "running" ? "bg-darkroom" : "border border-dashed border-foreground/20 bg-muted/40",
                    )}
                  >
                    {thumb ? (
                      <Link href={`/app/gallery/${thumb.id}`} tabIndex={-1} aria-hidden="true" className="block size-full">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                        <img src={thumb.thumbUrl} alt="" className="size-full object-cover" loading="lazy" />
                      </Link>
                    ) : state.kind === "running" ? (
                      <div className="flex size-full flex-col items-center justify-center gap-2 shadow-[inset_0_0_60px_-20px_var(--darkroom-safelight)]">
                        <span className="font-mono text-2xl text-darkroom-foreground tabular-nums">
                          {Math.min(99, Math.max(1, Math.round(job.progress || 0)))}
                          <span className="text-sm text-darkroom-muted">%</span>
                        </span>
                      </div>
                    ) : null}
                    {trouble && (
                      <PencilCross strokeWidth={2.4} className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="font-mono text-[11px] tracking-[0.12em] text-foreground tabular-nums">
                        <span aria-hidden="true" className="text-safelight-ink">
                          ▸{" "}
                        </span>
                        {frameNumber(i)}
                      </span>
                      <span
                        className={cn(
                          "border px-1.5 py-1 font-mono text-[10px] leading-none tracking-[0.12em] uppercase",
                          CHIP[state.kind],
                        )}
                      >
                        {darkroomStatus(state)}
                      </span>
                    </div>
                    <p className="truncate text-[13px] leading-snug font-medium">
                      {thumb ? (
                        <Link href={`/app/gallery/${thumb.id}`} className="underline-offset-4 hover:underline">
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </p>
                    <p className={cn("text-xs", state.kind === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {state.label}
                      {retryState && (
                        <>
                          {" · Retry: "}
                          {retryJob?.status === "succeeded" && retryJob.media[0] ? (
                            <Link
                              href={`/app/gallery/${retryJob.media[0].id}`}
                              className="font-medium text-foreground underline underline-offset-4"
                            >
                              done, open it
                            </Link>
                          ) : (
                            retryState.label.toLowerCase()
                          )}
                        </>
                      )}
                    </p>
                    {state.kind === "running" && (
                      <Progress
                        value={job.progress}
                        aria-label={`${title} progress`}
                        className="h-1 rounded-none bg-foreground/10"
                        indicatorClassName="bg-safelight"
                      />
                    )}
                    {canRetry(job) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void retry([job], job.id)}
                        disabled={submitting !== null}
                        aria-label={`Retry ${title} (${creditsText(retryCost([job]))})`}
                        className="mt-auto self-start"
                      >
                        {submitting === job.id ? (
                          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                        ) : (
                          <RotateCcwIcon aria-hidden="true" />
                        )}
                        Retry
                        <CreditReadout credits={retryCost([job])} />
                      </Button>
                    )}
                    {retryJob && !isTerminalStatus(retryJob.status) && (
                      <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-safelight-ink uppercase">
                        <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
                        Retry developing
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {problems > 0 && (
        <p className="max-w-[68ch] border-l-2 border-safelight-ink pl-3 text-xs text-muted-foreground">
          <span className="mono-caps mr-2 text-safelight-ink">Lab notice</span>
          Photos that fail or are blocked are refunded automatically. Blocked photos broke a safety rule, so retrying
          them won&apos;t help; failed ones usually work on a second try.
        </p>
      )}
    </section>
  );
}
