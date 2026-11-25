"use client";

import * as React from "react";
import Link from "next/link";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CoinsIcon,
  HourglassIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { newIdempotencyKey } from "@/components/create/logic";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isTerminalStatus } from "@/hooks/job-status";
import { useBatch, useJobs } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, api } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { cn } from "@/lib/utils";
import type { JobDTO } from "@/types/domain";
import { batchItemState, batchItemTitle, retryCost, retryRequest, type BatchItemKind } from "./batch-items-logic";

const ICONS: Record<BatchItemKind, React.ReactNode> = {
  waiting: <HourglassIcon className="text-muted-foreground" />,
  running: <LoaderCircleIcon className="animate-spin text-primary motion-reduce:animate-none" />,
  done: <CheckIcon className="text-success" />,
  partial: <CircleAlertIcon className="text-warning" />,
  failed: <CircleAlertIcon className="text-destructive" />,
  blocked: <ShieldAlertIcon className="text-warning" />,
  canceled: <BanIcon className="text-muted-foreground" />,
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="batch-items-title" className="text-lg font-semibold">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="batch-items-list"
            onClick={() => setOpen(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-sm"
          >
            Each photo
            <span className="text-sm font-normal text-muted-foreground">
              {jobs.length} · {problems > 0 ? `${problems} didn't work` : isTerminal ? "all done" : "in progress"}
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
            Retry {failed.length} failed · {creditsText(retryCost(failed))}
          </Button>
        )}
      </div>

      {expanded && (
        <ul id="batch-items-list" className="flex flex-col divide-y rounded-xl border bg-card">
          {jobs.map((job, i) => {
            const state = batchItemState(job);
            const title = batchItemTitle(job, i, promptTitles);
            const thumb = job.media[0];
            const retryJob = latestRetry(job);
            const retryState = retryJob ? batchItemState(retryJob) : null;
            return (
              <li key={job.id} className="flex items-center gap-3 px-3 py-2.5 text-sm sm:px-4">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted [&_svg]:size-4">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                    <img src={thumb.thumbUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{ICONS[state.kind]}</span>
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-medium">
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
                      className="h-1"
                      indicatorClassName="bg-brand-gradient"
                    />
                  )}
                </div>
                {canRetry(job) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void retry([job], job.id)}
                    disabled={submitting !== null}
                    aria-label={`Retry ${title} (${creditsText(retryCost([job]))})`}
                  >
                    {submitting === job.id ? (
                      <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                    ) : (
                      <RotateCcwIcon aria-hidden="true" />
                    )}
                    Retry
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
                    >
                      <CoinsIcon className="size-3" />
                      {retryCost([job]) || "Free"}
                    </span>
                  </Button>
                )}
                {retryJob && !isTerminalStatus(retryJob.status) && (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-4 animate-spin text-primary motion-reduce:animate-none"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {problems > 0 && (
        <p className="text-xs text-muted-foreground">
          Photos that fail or are blocked are refunded automatically. Blocked photos broke a safety rule, so retrying
          them won&apos;t help; failed ones usually work on a second try.
        </p>
      )}
    </section>
  );
}
