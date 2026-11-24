import { describe, expect, it } from "vitest";
import {
  JOB_POLL_INTERVAL_MS,
  aggregateProgress,
  allJobsTerminal,
  countJobsByStatus,
  isBatchTerminal,
  isTerminalStatus,
  jobPollInterval,
  jobsPollInterval,
} from "@/hooks/job-status";
import { JOB_STATUSES, TERMINAL_JOB_STATUSES, type JobStatus } from "@/types/domain";

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
