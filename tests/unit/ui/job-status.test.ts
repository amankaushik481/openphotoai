import { describe, expect, it } from "vitest";
import {
  JOB_POLL_INTERVAL_MS,
  aggregateProgress,
  allJobsTerminal,
  batchPollInterval,
  countJobsByStatus,
  isBatchTerminal,
  isTerminalStatus,
  jobPollInterval,
  jobsPollInterval,
  pollDelayMs,
} from "@/hooks/job-status";
import { JOB_STATUSES, TERMINAL_JOB_STATUSES, type JobStatus, type JobType } from "@/types/domain";

const j = (status: JobStatus, progress = 0) => ({ status, progress });

describe("job polling helpers", () => {
  it("treats exactly the contract's terminal statuses as terminal", () => {
    for (const s of JOB_STATUSES) expect(isTerminalStatus(s)).toBe(TERMINAL_JOB_STATUSES.includes(s));
    expect(isTerminalStatus(undefined)).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });

  it("polls every 1.5s while a job is in flight and stops when terminal", () => {
    expect(JOB_POLL_INTERVAL_MS).toBe(1500);
    expect(jobPollInterval(j("queued"))).toBe(1500);
    expect(jobPollInterval(j("running"))).toBe(1500);
    for (const s of TERMINAL_JOB_STATUSES) expect(jobPollInterval(j(s))).toBe(0);
    expect(jobPollInterval(undefined)).toBe(0);
  });

  it("polls a list until every job is terminal", () => {
    expect(jobsPollInterval([j("succeeded"), j("running")])).toBe(1500);
    expect(jobsPollInterval([j("succeeded"), j("failed"), j("blocked")])).toBe(0);
    expect(jobsPollInterval([])).toBe(0);
    expect(allJobsTerminal([])).toBe(true);
  });

  it("keeps a batch polling while the batch itself is running", () => {
    expect(isBatchTerminal("running", [j("succeeded")])).toBe(false);
    expect(isBatchTerminal("completed", [j("succeeded"), j("canceled")])).toBe(true);
    expect(isBatchTerminal("completed", [j("succeeded"), j("queued")])).toBe(false);
  });

  it("aggregates progress with terminal jobs counted as complete", () => {
    expect(aggregateProgress([])).toBe(0);
    expect(aggregateProgress([j("running", 50), j("succeeded", 0)])).toBe(75);
    expect(aggregateProgress([j("running", 150), j("queued", -5)])).toBe(50);
  });

  it("counts jobs by status", () => {
    const counts = countJobsByStatus([j("running"), j("running"), j("failed")]);
    expect(counts).toMatchObject({ running: 2, failed: 1, succeeded: 0 });
  });
});

describe("poll backoff", () => {
  const NOW = Date.parse("2026-03-01T12:00:00Z");
  const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
  const job = (type: JobType, ageSec: number, status: JobStatus = "running") => ({ status, type, createdAt: ago(ageSec) });

  it("polls young jobs fast and backs off as they age", () => {
    expect(pollDelayMs(job("generate", 5), NOW)).toBe(1500);
    expect(pollDelayMs(job("generate", 30), NOW)).toBe(4000);
    expect(pollDelayMs(job("generate", 600), NOW)).toBe(10_000);
    // Clock skew (job "in the future") counts as brand new.
    expect(pollDelayMs(job("generate", -30), NOW)).toBe(1500);
  });

  it("paces long-running job types slower", () => {
    expect(pollDelayMs(job("train", 5), NOW)).toBe(1500);
    expect(pollDelayMs(job("train", 60), NOW)).toBe(5000);
    expect(pollDelayMs(job("train", 900), NOW)).toBe(15_000);
    expect(pollDelayMs(job("video", 60), NOW)).toBe(5000);
    expect(pollDelayMs(job("talking_video", 600), NOW)).toBe(10_000);
  });

  it("uses the most urgent in-flight job for lists and stops when all are terminal", () => {
    expect(jobsPollInterval([job("generate", 600), job("generate", 3)], NOW)).toBe(1500);
    expect(jobsPollInterval([job("generate", 600), job("generate", 3, "succeeded")], NOW)).toBe(10_000);
    expect(jobPollInterval(job("generate", 600, "failed"), NOW)).toBe(0);
  });

  it("paces batches by the batch age", () => {
    expect(batchPollInterval({ status: "running", createdAt: ago(5) }, [j("running")], NOW)).toBe(1500);
    expect(batchPollInterval({ status: "running", createdAt: ago(300) }, [j("succeeded")], NOW)).toBe(10_000);
    expect(batchPollInterval({ status: "completed", createdAt: ago(5) }, [j("succeeded")], NOW)).toBe(0);
    expect(batchPollInterval(undefined, [], NOW)).toBe(0);
  });
});
