/** Pure job-polling helpers shared by useJob/useJobs/useBatch (no React; unit-tested). */
import { TERMINAL_JOB_STATUSES, type BatchStatus, type JobDTO, type JobStatus } from "@/types/domain";

export const JOB_POLL_INTERVAL_MS = 1500;

export function isTerminalStatus(status: JobStatus | null | undefined): boolean {
  return status != null && TERMINAL_JOB_STATUSES.includes(status);
}

/** True when every job is terminal (an empty list counts as done). */
export function allJobsTerminal(jobs: ReadonlyArray<Pick<JobDTO, "status">>): boolean {
  return jobs.every((j) => isTerminalStatus(j.status));
}

/** SWR `refreshInterval` for a single job: poll until terminal; don't poll before the first load. */
export function jobPollInterval(job: Pick<JobDTO, "status"> | null | undefined): number {
  if (!job) return 0;
  return isTerminalStatus(job.status) ? 0 : JOB_POLL_INTERVAL_MS;
}

/** SWR `refreshInterval` for a list of jobs. */
export function jobsPollInterval(jobs: ReadonlyArray<Pick<JobDTO, "status">> | null | undefined): number {
  if (!jobs || jobs.length === 0) return 0;
  return allJobsTerminal(jobs) ? 0 : JOB_POLL_INTERVAL_MS;
}

export function isBatchTerminal(
  batchStatus: BatchStatus | null | undefined,
  jobs: ReadonlyArray<Pick<JobDTO, "status">>,
): boolean {
  if (batchStatus === "running") return false;
  return allJobsTerminal(jobs);
}

/** Aggregate progress (0–100) across jobs; terminal jobs count as 100. */
export function aggregateProgress(jobs: ReadonlyArray<Pick<JobDTO, "status" | "progress">>): number {
  if (jobs.length === 0) return 0;
  const sum = jobs.reduce(
    (acc, j) => acc + (isTerminalStatus(j.status) ? 100 : Math.min(100, Math.max(0, j.progress || 0))),
    0,
  );
  return Math.round(sum / jobs.length);
}

/** Counts by status, useful for "12 of 50 done" style summaries. */
export function countJobsByStatus(jobs: ReadonlyArray<Pick<JobDTO, "status">>): Record<JobStatus, number> {
  const counts: Record<JobStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
    blocked: 0,
  };
  for (const j of jobs) counts[j.status] += 1;
  return counts;
}
