"use client";

import * as React from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { ApiClientError, api, fetcher } from "@/lib/api-client";
import type { BatchStatus, JobDTO } from "@/types/domain";
import {
  JOB_POLL_INTERVAL_MS,
  allJobsTerminal,
  isBatchTerminal,
  isTerminalStatus,
  jobPollInterval,
  jobsPollInterval,
} from "./job-status";

/** Don't hammer the API for errors that won't fix themselves. */
function shouldRetry(err: unknown): boolean {
  return !(err instanceof ApiClientError && [400, 401, 403, 404].includes(err.status));
}

const baseConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 1_000,
  shouldRetryOnError: shouldRetry,
};

/** Calls `cb` once when `job` first becomes terminal (not when it was already terminal on mount). */
function useOnTerminal<T extends { status: string }>(
  item: T | undefined,
  terminal: boolean,
  cb: ((item: T) => void) | undefined,
) {
  const cbRef = React.useRef(cb);
  React.useEffect(() => {
    cbRef.current = cb;
  });
  const seenNonTerminal = React.useRef(false);
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (!item) return;
    if (!terminal) {
      seenNonTerminal.current = true;
      fired.current = false;
      return;
    }
    if (seenNonTerminal.current && !fired.current) {
      fired.current = true;
      cbRef.current?.(item);
    }
  }, [item, terminal]);
}

export interface UseJobOptions {
  /** Fires once when a job that was in progress reaches a terminal status. */
  onTerminal?: (job: JobDTO) => void;
  /** Seed data (e.g. the job returned by POST /api/jobs) to render instantly. */
  fallbackJob?: JobDTO;
}

/** Poll GET /api/jobs/:id every 1.5s until the job reaches a terminal status. */
export function useJob(jobId: string | null | undefined, options: UseJobOptions = {}) {
  const { data, error, isLoading, mutate } = useSWR<{ job: JobDTO }>(
    jobId ? `/api/jobs/${jobId}` : null,
    fetcher,
    {
      ...baseConfig,
      fallbackData: options.fallbackJob ? { job: options.fallbackJob } : undefined,
      refreshInterval: (latest) => jobPollInterval(latest?.job),
    },
  );
  const job = data?.job;
  const isTerminal = isTerminalStatus(job?.status);
  useOnTerminal(job, isTerminal, options.onTerminal);

  const cancel = React.useCallback(async () => {
    if (!jobId) return;
    const res = await api<{ job: JobDTO }>(`/api/jobs/${jobId}/cancel`, { method: "POST" });
    await mutate(res, { revalidate: false });
    return res.job;
  }, [jobId, mutate]);

  return { job, error: error as ApiClientError | Error | undefined, isLoading, isTerminal, mutate, cancel };
}

/**
 * Poll several jobs at once. Terminal jobs are cached and not re-fetched; only in-flight
 * jobs hit the API on each tick.
 */
export function useJobs(ids: readonly string[], options: { onAllTerminal?: (jobs: JobDTO[]) => void } = {}) {
  const terminalCache = React.useRef(new Map<string, JobDTO>());
  const key = ids.length > 0 ? ["jobs", ...ids] : null;

  const { data, error, isLoading, mutate } = useSWR<JobDTO[]>(
    key,
    async () =>
      Promise.all(
        ids.map(async (id) => {
          const cached = terminalCache.current.get(id);
          if (cached) return cached;
          const { job } = await api<{ job: JobDTO }>(`/api/jobs/${id}`);
          if (isTerminalStatus(job.status)) terminalCache.current.set(id, job);
          return job;
        }),
      ),
    { ...baseConfig, refreshInterval: (latest) => jobsPollInterval(latest) },
  );

  const jobs = React.useMemo(() => data ?? [], [data]);
  const allDone = ids.length > 0 && jobs.length === ids.length && allJobsTerminal(jobs);
  // Undefined until loaded, so jobs that were already finished on mount don't fire the callback.
  const summary = React.useMemo(() => (data ? { status: allDone ? "done" : "running" } : undefined), [data, allDone]);
  useOnTerminal(summary, allDone, options.onAllTerminal ? () => options.onAllTerminal?.(jobs) : undefined);

  return { jobs, error, isLoading, allDone, mutate };
}

/** Shape of `batch` in GET /api/batches/:id (owned by the job engine; only stable fields typed). */
export interface BatchSummary {
  id: string;
  status: BatchStatus;
  packId?: string | null;
  modelId?: string | null;
  [key: string]: unknown;
}

/** Poll GET /api/batches/:id until the batch and all its jobs are terminal. */
export function useBatch(batchId: string | null | undefined, options: { onTerminal?: (jobs: JobDTO[]) => void } = {}) {
  const { data, error, isLoading, mutate } = useSWR<{ batch: BatchSummary; jobs: JobDTO[] }>(
    batchId ? `/api/batches/${batchId}` : null,
    fetcher,
    {
      ...baseConfig,
      refreshInterval: (latest) =>
        latest && !isBatchTerminal(latest.batch.status, latest.jobs) ? JOB_POLL_INTERVAL_MS : 0,
    },
  );
  const jobs = React.useMemo(() => data?.jobs ?? [], [data]);
  const isTerminal = data ? isBatchTerminal(data.batch.status, jobs) : false;
  const summary = React.useMemo(() => (data ? { status: isTerminal ? "done" : "running" } : undefined), [data, isTerminal]);
  useOnTerminal(summary, isTerminal, options.onTerminal ? () => options.onTerminal?.(jobs) : undefined);

  return { batch: data?.batch, jobs, error, isLoading, isTerminal, mutate };
}
