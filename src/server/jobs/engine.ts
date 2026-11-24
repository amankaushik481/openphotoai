/**
 * Job engine: Postgres-backed job queue with provider webhooks + polling fallback.
 * CONTRACT FILE (owner: job-engine workstream). See handlers/types.ts for the lifecycle.
 */
import type { BatchRow, JobRow, UserRow } from "@/db/types";
import type { WebhookRequest } from "@/providers/types";
import type { AIProviderName, CreateBatchRequest, JobDTO, JobInput } from "@/types/domain";

export interface CreateJobOptions {
  apiKeyId?: string | null;
  idempotencyKey?: string | null;
  batchId?: string | null;
  /** Skip per-request rate limits (used by createBatch, which rate-limits once). */
  skipRateLimit?: boolean;
}

/** Validate, authorize, charge and submit a job. Returns the job row (status running or failed). */
export async function createJob(user: UserRow, input: JobInput, opts?: CreateJobOptions): Promise<JobRow> {
  void user;
  void input;
  void opts;
  throw new Error("not implemented: createJob (job-engine)");
}

/** One pack -> many images. Creates a batch + N generate jobs spread over the pack's prompts. */
export async function createBatch(user: UserRow, req: CreateBatchRequest, opts?: { apiKeyId?: string | null }): Promise<{ batch: BatchRow; jobs: JobRow[] }> {
  void user;
  void req;
  void opts;
  throw new Error("not implemented: createBatch (job-engine)");
}

export async function toJobDTO(job: JobRow): Promise<JobDTO> {
  void job;
  throw new Error("not implemented: toJobDTO (job-engine)");
}

/** Load a job owned by the user; lazily syncs with the provider if it is stale. */
export async function getJobForUser(userId: string, jobId: string, opts?: { sync?: boolean }): Promise<JobRow> {
  void userId;
  void jobId;
  void opts;
  throw new Error("not implemented: getJobForUser (job-engine)");
}

/** Poll the provider for a running job and apply the result. Safe to call concurrently. */
export async function syncJob(jobId: string, opts?: { force?: boolean }): Promise<JobRow> {
  void jobId;
  void opts;
  throw new Error("not implemented: syncJob (job-engine)");
}

/** Verify + apply an AI provider webhook. Idempotent (webhook_events). */
export async function handleAIWebhook(provider: AIProviderName, req: WebhookRequest): Promise<{ ok: true; jobId?: string }> {
  void provider;
  void req;
  throw new Error("not implemented: handleAIWebhook (job-engine)");
}

export async function cancelJob(userId: string, jobId: string): Promise<JobRow> {
  void userId;
  void jobId;
  throw new Error("not implemented: cancelJob (job-engine)");
}

/** Cron/worker: sync running jobs not updated recently; fail jobs stuck too long (with refund). */
export async function pollStaleJobs(opts?: { limit?: number; olderThanSec?: number }): Promise<{ checked: number; completed: number; failed: number }> {
  void opts;
  throw new Error("not implemented: pollStaleJobs (job-engine)");
}

/** Mark a job failed and refund the unrefunded remainder of its credits. Idempotent. */
export async function failJob(jobId: string, error: string, errorCode?: string, status?: "failed" | "canceled" | "blocked"): Promise<JobRow> {
  void jobId;
  void error;
  void errorCode;
  void status;
  throw new Error("not implemented: failJob (job-engine)");
}
