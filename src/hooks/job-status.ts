/** Pure job-polling helpers shared by useJob/useJobs/useBatch (no React; unit-tested). */
import { TERMINAL_JOB_STATUSES, type BatchStatus, type JobDTO, type JobStatus, type JobType } from "@/types/domain";

/** Poll interval while a job is young (most image jobs finish within it). */
export const JOB_POLL_INTERVAL_MS = 1500;
/** Backoff by job age: fast for FAST_PHASE_MS, then MEDIUM_POLL_INTERVAL_MS until MEDIUM_PHASE_MS, then slow. */
const FAST_PHASE_MS = 15_000;
const MEDIUM_PHASE_MS = 120_000;
const MEDIUM_POLL_INTERVAL_MS = 4_000;
const SLOW_POLL_INTERVAL_MS = 10_000;
/** Training takes ~20 minutes; the model page also refreshes when the job ends. */
const TRAIN_MEDIUM_POLL_INTERVAL_MS = 5_000;
const TRAIN_SLOW_POLL_INTERVAL_MS = 15_000;
/** Video jobs take minutes. */
const VIDEO_MIN_POLL_INTERVAL_MS = 5_000;
const VIDEO_TYPES: ReadonlySet<JobType> = new Set<JobType>(["video", "talking_video"]);

/** Fields used to pace polling (`type` / `createdAt` are optional so partial job shapes still poll). */
export type PolledJob = Pick<JobDTO, "status"> & Partial<Pick<JobDTO, "type" | "createdAt">>;

export function isTerminalStatus(status: JobStatus | null | undefined): boolean {
  return status != null && TERMINAL_JOB_STATUSES.includes(status);
}

/** True when every job is terminal (an empty list counts as done). */
export function allJobsTerminal(jobs: ReadonlyArray<Pick<JobDTO, "status">>): boolean {
  return jobs.every((j) => isTerminalStatus(j.status));
}

/**
 * How long to wait before the next poll of an in-flight job: fast while it is young, then backing off
 * (every poll can drive a provider status call and re-render thumbnails, and viewers multiply it).
 */
export function pollDelayMs(job: Partial<Pick<JobDTO, "type" | "createdAt">>, nowMs: number = Date.now()): number {
  const created = job.createdAt ? Date.parse(job.createdAt) : Number.NaN;
  const age = Number.isFinite(created) ? Math.max(0, nowMs - created) : 0;
  const phase = age < FAST_PHASE_MS ? "fast" : age < MEDIUM_PHASE_MS ? "medium" : "slow";
  if (phase === "fast") return JOB_POLL_INTERVAL_MS;
  if (job.type === "train") return phase === "medium" ? TRAIN_MEDIUM_POLL_INTERVAL_MS : TRAIN_SLOW_POLL_INTERVAL_MS;
  const delay = phase === "medium" ? MEDIUM_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
  return job.type && VIDEO_TYPES.has(job.type) ? Math.max(delay, VIDEO_MIN_POLL_INTERVAL_MS) : delay;
}

/** SWR `refreshInterval` for a single job: poll until terminal; don't poll before the first load. */
export function jobPollInterval(job: PolledJob | null | undefined, nowMs?: number): number {
  if (!job) return 0;
  return isTerminalStatus(job.status) ? 0 : pollDelayMs(job, nowMs);
}

/** SWR `refreshInterval` for a list of jobs: paced by the most urgent in-flight job. */
export function jobsPollInterval(jobs: ReadonlyArray<PolledJob> | null | undefined, nowMs?: number): number {
  if (!jobs || jobs.length === 0) return 0;
  const delays = jobs.filter((j) => !isTerminalStatus(j.status)).map((j) => pollDelayMs(j, nowMs));
  return delays.length ? Math.min(...delays) : 0;
}

/** SWR `refreshInterval` for a batch: paced by the batch's age until it and all its jobs are terminal. */
export function batchPollInterval(
  batch: { status: BatchStatus; createdAt?: string } | null | undefined,
  jobs: ReadonlyArray<Pick<JobDTO, "status">>,
  nowMs?: number,
): number {
  if (!batch || isBatchTerminal(batch.status, jobs)) return 0;
  return pollDelayMs({ type: "generate", createdAt: batch.createdAt }, nowMs);
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
