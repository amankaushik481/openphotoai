/**
 * Job handler contract. CONTRACT FILE (owner: job-engine; each handler file is owned by its feature).
 *
 * Lifecycle driven by src/server/jobs/engine.ts:
 *   createJob(user, input)
 *     -> handler.plan()          authorize + resolve resources (throw AppError on problems)
 *     -> safety.assertTextAllowed(plan.textsToModerate)
 *     -> rate limits, plan limits, credits debit (creditCost(input)), insert job row (status queued)
 *     -> handler.submit()        send to provider, returns ProviderJobRef (job -> running)
 *   provider webhook / polling
 *     -> succeeded: handler.complete?() or default ingestion (images -> ingestImages, videos -> ingestVideos)
 *     -> failed/canceled: refund + handler.onFailed?()
 */
import type { JobRow, UserRow } from "@/db/types";
import type { ProviderJobRef, ProviderOutput, SubmitOptions } from "@/providers/types";
import type { JobInputOf, JobType } from "@/types/domain";

export interface JobPlan {
  modelId?: string | null;
  packId?: string | null;
  sourceMediaId?: string | null;
  /** User-provided text that must pass the prompt safety filter. */
  textsToModerate: string[];
  /** Persisted on jobs.output.plan; available to submit()/complete(). JSON-serializable. */
  data: Record<string, unknown>;
}

export interface SubmitArgs<T extends JobType> {
  user: UserRow;
  job: JobRow;
  input: JobInputOf<T>;
  plan: JobPlan;
  submitOpts: SubmitOptions;
}

export interface CompleteArgs {
  job: JobRow;
  output: ProviderOutput;
  plan: JobPlan["data"];
}

export interface CompleteResult {
  mediaIds: string[];
  blockedCount: number;
  /** Extra fields merged into jobs.output. */
  extra?: Record<string, unknown>;
}

export interface JobHandler<T extends JobType = JobType> {
  type: T;
  plan(args: { user: UserRow; input: JobInputOf<T> }): Promise<JobPlan>;
  submit(args: SubmitArgs<T>): Promise<ProviderJobRef>;
  /** Optional custom completion (default: ingest images/videos as media). */
  complete?(args: CompleteArgs): Promise<CompleteResult>;
  /** Optional hook after failure/cancel/block (credits are refunded by the engine). */
  onFailed?(args: { job: JobRow; error: string }): Promise<void>;
}

/** Helper for handler files: `export default defineHandler({ type: "upscale", ... })`. */
export function defineHandler<T extends JobType>(h: JobHandler<T>): JobHandler<T> {
  return h;
}

export function notImplementedHandler<T extends JobType>(type: T): JobHandler<T> {
  const fail = async (): Promise<never> => {
    const { AppError } = await import("@/server/http");
    throw new AppError("internal", `Job type "${type}" is not implemented yet.`);
  };
  return { type, plan: fail, submit: fail };
}
