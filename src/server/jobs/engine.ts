/**
 * Job engine: Postgres-backed job queue with provider webhooks + polling fallback.
 * CONTRACT FILE (owner: job-engine workstream). See handlers/types.ts for the lifecycle.
 *
 * Concurrency model (webhooks, lazy GET sync, cron and the worker may all race on one job):
 *  - Polling is throttled with a row-level claim on `last_polled_at` (conditional UPDATE ... RETURNING).
 *  - Completion is guarded by a *finalization lease* stored in `jobs.output.finalizing` ({token, at}),
 *    taken with a conditional UPDATE while the job is `running`. Only the lease holder downloads and
 *    ingests outputs, so concurrent webhook + poll never double-ingest. The final running -> succeeded
 *    transition requires the same token; if the lease was lost (job canceled, or the lease expired and
 *    another worker took over) the holder deletes the media it created. A lease that outlives a crash
 *    expires after FINALIZE_LEASE_SEC; the next holder first deletes any leftover media of the job.
 *  - Every terminal transition is a conditional UPDATE from queued/running, done in the same transaction
 *    as the batch counter bump, so counters and `handler.onFailed` run exactly once.
 *  - Refunds are idempotent (ledger idempotency keys per tag), so retries can never over-refund.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { creditCost } from "@/config/credits";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { batches, jobs, webhookEvents } from "@/db/schema";
import type { BatchRow, JobRow, UserRow } from "@/db/types";
import { env } from "@/lib/env";
import { getAIProvider } from "@/providers/registry";
import type {
  AIWebhookEvent,
  ProviderJobRef,
  ProviderJobStatus,
  ProviderOutput,
  WebhookRequest,
} from "@/providers/types";
import { debitForJob, refundJob } from "@/server/credits/ledger";
import { AppError, errors } from "@/server/http";
import { deleteJobMedia, deleteMediaByIds, ingestImages, ingestVideos } from "@/server/media/service";
import { getOwnedModel } from "@/server/models/service";
import { getPack } from "@/server/packs/registry";
import { rateLimit } from "@/server/rate-limit";
import { assertTextAllowed } from "@/server/safety";
import {
  generateJobInput,
  jobInputSchema,
  TERMINAL_JOB_STATUSES,
  type AIProviderName,
  type CreateBatchRequest,
  type JobDTO,
  type JobInput,
  type JobOutput,
  type JobStatus,
} from "@/types/domain";
import { bumpBatchCounters, repairStaleBatches, setBatchTotal } from "./batches";
import { brandKitAspectRatio, getUsableBrandKit } from "./brand-kits";
import { estimateCostUsd, expectedOutputs } from "./costs";
import { getHandler } from "./handlers";
import type { CompleteResult } from "./handlers/types";
import { toJobDTOs } from "./queries";
import { errorMessage, isNonRetryable, isUniqueViolation, mapLimit } from "./util";

/** Minimum seconds between provider status polls for one job (unless forced). */
export const SYNC_MIN_INTERVAL_SEC = 3;
/** How long a finalization lease is valid before another worker may take over. */
export const FINALIZE_LEASE_SEC = 300;
/** Completion (download + ingest) attempts before the job is failed and refunded. */
export const MAX_FINALIZE_ATTEMPTS = 3;
export const JOB_TIMEOUT_SEC = 2 * 60 * 60;
export const TRAIN_TIMEOUT_SEC = 6 * 60 * 60;
/** A job still `queued` after this long never reached the provider (crash between charge and submit). */
export const QUEUED_TIMEOUT_SEC = 10 * 60;
/** Parallel provider polls per pollStaleJobs run. */
const POLL_CONCURRENCY = 5;
/** Parallel job submissions while creating a batch. */
const BATCH_SUBMIT_CONCURRENCY = 5;

const ACTIVE_STATUSES: JobStatus[] = ["queued", "running"];

/** User-facing failure message that also says the credits came back. */
function withRefundNote(message: string): string {
  const text = message.trim();
  if (/refund/i.test(text)) return text;
  return `${text}${/[.!?]$/.test(text) ? "" : "."} Your credits were refunded.`;
}
const isTerminal = (s: JobStatus) => TERMINAL_JOB_STATUSES.includes(s);

const MSG = {
  provider: "The AI provider couldn't finish this job. Your credits were refunded.",
  submit: "The AI provider couldn't start this job. Your credits were refunded.",
  noOutput: "The AI provider returned no results. Your credits were refunded.",
  allBlocked: "All results were blocked by our safety filter",
  canceled: "Canceled. Your credits were refunded.",
  providerCanceled: "The job was canceled by the AI provider. Your credits were refunded.",
  timeout: "This job took too long and timed out. Your credits were refunded.",
  ingest: "We couldn't process the results. Your credits were refunded.",
} as const;

export interface CreateJobOptions {
  apiKeyId?: string | null;
  idempotencyKey?: string | null;
  batchId?: string | null;
  /** Skip per-request rate limits (used by createBatch, which rate-limits once). */
  skipRateLimit?: boolean;
}

/* ───────────────────────────── helpers ───────────────────────────── */

async function loadJob(jobId: string): Promise<JobRow> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!row) throw errors.notFound("Job");
  return row;
}

async function findByIdempotencyKey(userId: string, key: string): Promise<JobRow | undefined> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, key)))
    .limit(1);
  return row;
}

function refOf(job: JobRow): ProviderJobRef | null {
  if (!job.provider || !job.providerRequestId) return null;
  return { provider: job.provider, endpoint: job.providerEndpoint ?? "", requestId: job.providerRequestId };
}

function planDataOf(job: JobRow): Record<string, unknown> {
  const plan = job.output?.plan;
  return plan && typeof plan === "object" ? (plan as Record<string, unknown>) : {};
}

function isDraftInput(input: JobInput): boolean {
  return input.type === "generate" && input.quality === "draft";
}

/** Plan concurrency: active standalone jobs + running batches (a batch occupies one slot). */
async function assertConcurrency(user: UserRow): Promise<void> {
  const plan = getPlan(user.plan);
  const limit = plan.limits.maxConcurrentJobs;
  const [[active], [running]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.userId, user.id), inArray(jobs.status, ACTIVE_STATUSES), isNull(jobs.batchId))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(batches)
      .where(and(eq(batches.userId, user.id), eq(batches.status, "running"))),
  ]);
  if (Number(active?.n ?? 0) + Number(running?.n ?? 0) >= limit) {
    const upgrade = user.plan === "studio" ? "" : " or upgrade your plan";
    throw errors.planLimit(
      `The ${plan.name} plan runs up to ${limit} jobs at once. Wait for one to finish${upgrade}.`,
    );
  }
}

/* ───────────────────────────── create ───────────────────────────── */

/** Validate, authorize, charge and submit a job. Returns the job row (status running or failed). */
export async function createJob(user: UserRow, input: JobInput, opts?: CreateJobOptions): Promise<JobRow> {
  const parsed = jobInputSchema.parse(input);
  const idempotencyKey = opts?.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(user.id, idempotencyKey);
    if (existing) return existing;
  }

  const subject = `user:${user.id}`;
  if (!opts?.skipRateLimit) {
    await rateLimit("jobsPerMinute", subject);
    await rateLimit("jobsPerDay", subject);
  }

  const handler = getHandler(parsed.type);
  const plan = await handler.plan({ user, input: parsed });
  const texts = plan.textsToModerate.map((t) => t?.trim()).filter((t): t is string => Boolean(t));
  if (texts.length) await assertTextAllowed(texts, { userId: user.id, modelId: plan.modelId ?? undefined });

  // Free drafts are capped per day (smaller allowance for users who never paid).
  if (isDraftInput(parsed)) await rateLimit(user.hasPaid ? "draftsPerDay" : "draftsPerDayFree", subject);
  if (!opts?.batchId) await assertConcurrency(user);

  const credits = plan.credits ?? creditCost(parsed);
  if (!Number.isInteger(credits) || credits < 0) throw new Error(`invalid credit cost ${credits} for ${parsed.type}`);
  const provider: AIProviderName = env.aiProvider;

  let job: JobRow;
  try {
    job = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(jobs)
        .values({
          userId: user.id,
          type: parsed.type,
          status: "queued",
          input: parsed,
          output: { plan: plan.data },
          creditsCharged: credits,
          costUsd: estimateCostUsd(parsed, provider, plan.data),
          modelId: plan.modelId ?? null,
          packId: plan.packId ?? null,
          sourceMediaId: plan.sourceMediaId ?? null,
          batchId: opts?.batchId ?? null,
          apiKeyId: opts?.apiKeyId ?? null,
          idempotencyKey,
        })
        .returning();
      if (credits > 0) await debitForJob({ userId: user.id, jobId: row!.id, amount: credits }, tx);
      return row!;
    });
  } catch (err) {
    // Concurrent replay of the same Idempotency-Key: the unique index rejected the second insert.
    if (idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(user.id, idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }

  const submitOpts = {
    webhookUrl: env.webhooksEnabled ? `${env.webhookBase}/api/webhooks/ai/${provider}` : undefined,
  };
  let ref: ProviderJobRef;
  try {
    ref = await handler.submit({ user, job, input: parsed, plan, submitOpts });
  } catch (err) {
    const appErr = err instanceof AppError && err.code !== "internal" ? err : null;
    if (!appErr) console.error(`[jobs] submit failed for ${job.id} (${job.type}):`, err);
    await failJob(job.id, appErr?.message ?? MSG.submit, appErr?.code ?? "provider_error", "failed", {
      detail: errorMessage(err),
    });
    throw appErr ?? errors.provider();
  }

  const [running] = await db
    .update(jobs)
    .set({
      status: "running",
      provider: ref.provider,
      providerEndpoint: ref.endpoint,
      providerRequestId: ref.requestId,
      submittedAt: new Date(),
      progress: 1,
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "queued")))
    .returning();
  if (running) return running;

  // Canceled/failed while we were submitting: stop the provider work too.
  await getAIProvider(ref.provider)
    .cancel(ref)
    .catch((e) => console.warn(`[jobs] provider cancel failed for ${job.id}:`, errorMessage(e)));
  return loadJob(job.id);
}

export interface CreateBatchResult {
  batch: BatchRow;
  jobs: JobRow[];
  requested: number;
  stoppedReason?: "insufficient_credits" | "error";
  /** True when an `Idempotency-Key` matched an earlier batch (nothing new was created or charged). */
  replayed?: boolean;
}

/** Child job `i` of a batch created with `Idempotency-Key: key` carries the job idempotency key `key:i`. */
const batchJobKey = (key: string, index: number) => `${key}:${index}`;

/** The batch an earlier request with this Idempotency-Key created (found via its first child job). */
async function findBatchByIdempotencyKey(user: UserRow, key: string, req: CreateBatchRequest): Promise<CreateBatchResult | null> {
  const first = await findByIdempotencyKey(user.id, batchJobKey(key, 0));
  if (!first) return null;
  const [batch] = first.batchId
    ? await db
        .select()
        .from(batches)
        .where(and(eq(batches.id, first.batchId), eq(batches.userId, user.id)))
        .limit(1)
    : [];
  if (!batch || batch.packId !== req.packId || batch.modelId !== req.modelId) {
    throw errors.conflict("This Idempotency-Key was already used for a different request.");
  }
  const childJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.batchId, batch.id), eq(jobs.userId, user.id)))
    .orderBy(jobs.createdAt);
  return { batch, jobs: childJobs, requested: batch.total, replayed: true };
}

/**
 * One pack -> many images. Creates a batch + N generate jobs spread over the pack's prompts.
 * With `idempotencyKey`, a retried request returns the batch the first one created (the key is stored
 * on the child jobs as `key:0`, `key:1`, ...; the batches table has no key column).
 */
export async function createBatch(
  user: UserRow,
  req: CreateBatchRequest,
  opts?: { apiKeyId?: string | null; idempotencyKey?: string | null },
): Promise<CreateBatchResult> {
  const idempotencyKey = opts?.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findBatchByIdempotencyKey(user, idempotencyKey, req);
    if (existing) return existing;
  }
  const plan = getPlan(user.plan);
  if (req.count > plan.limits.maxBatch) {
    throw errors.planLimit(`The ${plan.name} plan creates up to ${plan.limits.maxBatch} images per batch.`);
  }
  const pack = await getPack(req.packId);
  if (!pack) throw errors.notFound("Pack");
  // Fail fast (before charging rate limits or creating a batch) on an unusable model / brand kit.
  const model = await getOwnedModel(user.id, req.modelId);
  if (model.status !== "ready") throw errors.conflict(`"${model.name}" isn't ready yet.`);
  const kit = req.brandKitId ? await getUsableBrandKit(user.id, req.brandKitId) : null;

  const subject = `user:${user.id}`;
  await rateLimit("batchesPerHour", subject);
  await rateLimit("jobsPerDay", subject, req.count);
  await assertConcurrency(user);

  const [batch] = await db
    .insert(batches)
    .values({
      userId: user.id,
      modelId: req.modelId,
      packId: pack.slug,
      brandKitId: req.brandKitId ?? null,
      total: req.count,
    })
    .returning();
  const batchId = batch!.id;

  // Round-robin over the pack's prompts, one image per job for maximum variety.
  const offset = Math.floor(Math.random() * pack.prompts.length);
  const inputs = Array.from({ length: req.count }, (_, i) => {
    const promptIndex = (offset + i) % pack.prompts.length;
    const aspectRatio =
      req.aspectRatio ??
      (kit ? brandKitAspectRatio(kit) : undefined) ??
      pack.prompts[promptIndex]!.aspectRatio ??
      pack.defaultAspectRatio;
    return generateJobInput.parse({
      type: "generate",
      modelId: req.modelId,
      packId: pack.slug,
      packPromptIndex: promptIndex,
      quality: req.quality,
      numImages: 1,
      aspectRatio,
      brandKitId: req.brandKitId,
    });
  });

  // With a key, job 0 goes first and alone: if a concurrent request with the same key already created
  // it, we get that request's job back and hand over to its batch instead of creating a second one.
  const indexes = inputs.map((_, i) => i);
  const chunks: number[][] = [];
  if (idempotencyKey) chunks.push(indexes.splice(0, 1));
  while (indexes.length) chunks.push(indexes.splice(0, BATCH_SUBMIT_CONCURRENCY));

  let stoppedReason: "insufficient_credits" | "error" | undefined;
  let firstError: unknown;
  for (const chunk of chunks) {
    if (stoppedReason) break;
    const results = await Promise.allSettled(
      chunk.map((i) =>
        createJob(user, inputs[i]!, {
          batchId,
          skipRateLimit: true,
          apiKeyId: opts?.apiKeyId,
          idempotencyKey: idempotencyKey ? batchJobKey(idempotencyKey, i) : null,
        }),
      ),
    );
    if (idempotencyKey && chunk[0] === 0 && results[0]?.status === "fulfilled" && results[0].value.batchId !== batchId) {
      await db.delete(batches).where(and(eq(batches.id, batchId), eq(batches.userId, user.id)));
      const winner = await findBatchByIdempotencyKey(user, idempotencyKey, req);
      if (winner) return winner;
      throw errors.conflict("This Idempotency-Key was already used for a different request.");
    }
    for (const r of results) {
      if (r.status === "fulfilled") continue;
      const err: unknown = r.reason;
      firstError ??= err;
      // Out of credits: stop creating jobs. Anything else (provider down, blocked text...): the failed
      // job, if one was created, is already recorded + refunded; don't keep hammering.
      stoppedReason = err instanceof AppError && err.code === "insufficient_credits" ? "insufficient_credits" : "error";
    }
  }

  const childJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.batchId, batchId), eq(jobs.userId, user.id)))
    .orderBy(jobs.createdAt);

  if (childJobs.length === 0) {
    await db.delete(batches).where(and(eq(batches.id, batchId), eq(batches.userId, user.id)));
    throw firstError instanceof Error ? firstError : errors.provider();
  }
  const finalBatch =
    childJobs.length < req.count ? await setBatchTotal(batchId, childJobs.length) : await reloadBatch(batchId);
  return { batch: finalBatch ?? batch!, jobs: childJobs, requested: req.count, ...(stoppedReason ? { stoppedReason } : {}) };
}

async function reloadBatch(batchId: string): Promise<BatchRow | undefined> {
  const [row] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  return row;
}

/* ───────────────────────────── read ───────────────────────────── */

export async function toJobDTO(job: JobRow): Promise<JobDTO> {
  const [dto] = await toJobDTOs([job]);
  return dto!;
}

/** Load a job owned by the user; lazily syncs with the provider if it is stale. */
export async function getJobForUser(userId: string, jobId: string, opts?: { sync?: boolean }): Promise<JobRow> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!job) throw errors.notFound("Job");
  if ((opts?.sync ?? true) && job.status === "running") {
    try {
      return await syncJob(job.id);
    } catch (err) {
      console.warn(`[jobs] lazy sync failed for ${job.id}:`, errorMessage(err));
    }
  }
  return job;
}

/* ───────────────────────────── sync / complete ───────────────────────────── */

/** Poll the provider for a running job and apply the result. Safe to call concurrently. */
export async function syncJob(jobId: string, opts?: { force?: boolean }): Promise<JobRow> {
  const interval = opts?.force ? 0 : SYNC_MIN_INTERVAL_SEC;
  const [claimed] = await db
    .update(jobs)
    .set({ lastPolledAt: sql`now()` })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, "running"),
        or(isNull(jobs.lastPolledAt), sql`${jobs.lastPolledAt} <= now() - make_interval(secs => ${interval}::int)`),
      ),
    )
    .returning();
  if (!claimed) return loadJob(jobId);
  const ref = refOf(claimed);
  if (!ref) return claimed;

  let status: ProviderJobStatus;
  try {
    status = await getAIProvider(ref.provider).getStatus(ref);
  } catch (err) {
    console.warn(`[jobs] getStatus failed for ${jobId}:`, errorMessage(err));
    return claimed;
  }
  return applyProviderStatus(claimed, status);
}

async function applyProviderStatus(job: JobRow, status: ProviderJobStatus): Promise<JobRow> {
  if (job.status !== "running") return job;
  switch (status.state) {
    case "queued":
      return job;
    case "running": {
      if (status.progress === undefined || !Number.isFinite(status.progress)) return job;
      const pct = Math.round(Math.min(95, Math.max(1, status.progress <= 1 ? status.progress * 100 : status.progress)));
      if (pct <= job.progress) return job;
      const [row] = await db
        .update(jobs)
        .set({ progress: pct })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "running")))
        .returning();
      return row ?? job;
    }
    case "succeeded":
      return completeJob(job, status.output);
    case "failed":
      return failJob(job.id, MSG.provider, "provider_error", "failed", { detail: status.error });
    case "canceled":
      return failJob(job.id, MSG.providerCanceled, "canceled", "canceled");
  }
}

/** Take the finalization lease. Returns the leased row, or null if someone else holds it / job not running. */
async function acquireLease(jobId: string, token: string): Promise<JobRow | null> {
  const [row] = await db
    .update(jobs)
    .set({
      output: sql`coalesce(${jobs.output}, '{}'::jsonb) || jsonb_build_object('finalizing', jsonb_build_object('token', ${token}::text, 'at', now()))`,
      attempts: sql`${jobs.attempts} + 1`,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, "running"),
        sql`(${jobs.output} -> 'finalizing' is null or (${jobs.output} -> 'finalizing' ->> 'at')::timestamptz < now() - make_interval(secs => ${FINALIZE_LEASE_SEC}::int))`,
      ),
    )
    .returning();
  return row ?? null;
}

/** Give the lease back so a later sync retries, after `retryAfterSec` (backoff). */
async function releaseLease(jobId: string, token: string, retryAfterSec: number): Promise<void> {
  const ageSec = Math.max(0, FINALIZE_LEASE_SEC - retryAfterSec);
  await db
    .update(jobs)
    .set({
      output: sql`jsonb_set(${jobs.output}, '{finalizing,at}', to_jsonb(now() - make_interval(secs => ${ageSec}::int)))`,
    })
    .where(and(eq(jobs.id, jobId), sql`${jobs.output} -> 'finalizing' ->> 'token' = ${token}`));
}

/** Default completion: images -> ingestImages, videos -> ingestVideos (plan.prompt/seed/isDraft conventions). */
async function defaultComplete(job: JobRow, output: ProviderOutput, plan: Record<string, unknown>): Promise<CompleteResult> {
  const prompt = typeof plan.prompt === "string" ? plan.prompt : undefined;
  const seed = typeof plan.seed === "number" ? plan.seed : output.seed;
  const mediaIds: string[] = [];
  let blockedCount = 0;
  if (output.images?.length) {
    const r = await ingestImages(job, output.images, {
      isDraft: plan.isDraft === true,
      prompt,
      seed,
      scoreLikeness: plan.scoreLikeness !== false,
    });
    mediaIds.push(...r.mediaIds);
    blockedCount += r.blockedCount;
  }
  if (output.videos?.length) {
    const r = await ingestVideos(job, output.videos, { prompt });
    mediaIds.push(...r.mediaIds);
    blockedCount += r.blockedCount;
  }
  return { mediaIds, blockedCount, extra: { ...(prompt ? { finalPrompt: prompt } : {}), ...(seed !== undefined ? { seed } : {}) } };
}

async function completeJob(job: JobRow, output: ProviderOutput): Promise<JobRow> {
  const token = randomUUID();
  const leased = await acquireLease(job.id, token);
  if (!leased) return loadJob(job.id);

  // A previous holder died mid-ingest: drop whatever it stored before trying again.
  if (leased.attempts > 1) await deleteJobMedia(leased);

  const handler = getHandler(leased.type);
  const plan = planDataOf(leased);
  let result: CompleteResult;
  try {
    result = handler.complete
      ? await handler.complete({ job: leased, output, plan })
      : await defaultComplete(leased, output, plan);
  } catch (err) {
    console.error(`[jobs] completion attempt ${leased.attempts} failed for ${job.id}:`, err);
    // Deterministic failures (bad output, invalid data) fail + refund right away: retrying can't help.
    const final = isNonRetryable(err);
    if (final || leased.attempts >= MAX_FINALIZE_ATTEMPTS) {
      const appErr = final && err instanceof AppError && err.code !== "internal" ? err : null;
      const message = appErr ? withRefundNote(appErr.message) : MSG.ingest;
      return failJob(job.id, message, appErr?.code ?? "internal", "failed", { detail: errorMessage(err) });
    }
    await releaseLease(job.id, token, 30 * leased.attempts);
    return loadJob(job.id);
  }

  const kept = result.mediaIds.length;
  const blocked = result.blockedCount;
  if (kept === 0 && blocked > 0) return failJob(job.id, MSG.allBlocked, "content_blocked", "blocked");
  if (kept === 0 && !handler.complete) return failJob(job.id, MSG.noOutput, "provider_error");

  // Proportional refunds for blocked (and, by default ingestion, missing) outputs.
  const expected = handler.complete ? kept + blocked : Math.max(expectedOutputs(leased.input), kept + blocked);
  const perOutput = leased.creditsCharged / Math.max(1, expected);
  const missing = Math.max(0, expected - kept - blocked);
  if (blocked > 0 && Math.floor(perOutput * blocked) > 0) {
    await refundJob(job.id, { amount: Math.floor(perOutput * blocked), tag: "blocked", note: "Blocked by safety filter" });
  }
  if (missing > 0 && Math.floor(perOutput * missing) > 0) {
    await refundJob(job.id, { amount: Math.floor(perOutput * missing), tag: "missing", note: "Fewer results than requested" });
  }

  const { finalizing: _lease, ...prevOutput } = leased.output ?? {};
  void _lease;
  const nextOutput: JobOutput = { ...prevOutput, ...result.extra, mediaIds: result.mediaIds, blockedCount: blocked };
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({ status: "succeeded", progress: 100, output: nextOutput, completedAt: new Date(), error: null, errorCode: null })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "running"), sql`${jobs.output} -> 'finalizing' ->> 'token' = ${token}`))
      .returning();
    if (row?.batchId) await bumpBatchCounters(tx, row.batchId, "succeeded");
    return row;
  });
  if (done) return done;

  // Lost the lease (canceled meanwhile, or another worker took over): discard what we stored.
  await deleteMediaByIds(job.userId, result.mediaIds);
  return loadJob(job.id);
}

/* ───────────────────────────── webhooks ───────────────────────────── */

/** Verify + apply an AI provider webhook. Idempotent (webhook_events). */
export async function handleAIWebhook(provider: AIProviderName, req: WebhookRequest): Promise<{ ok: true; jobId?: string }> {
  let event: AIWebhookEvent;
  try {
    event = await getAIProvider(provider).parseWebhook(req);
  } catch (err) {
    console.warn(`[webhooks] rejected ${provider} webhook:`, errorMessage(err));
    throw errors.unauthorized("Invalid webhook signature.");
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.provider, provider), eq(jobs.providerRequestId, event.requestId)))
    .limit(1);
  // Unknown request (or one whose submit hasn't been recorded yet): polling will pick it up.
  if (!job) return { ok: true };

  const source = `ai:${provider}`;
  const inserted = await db
    .insert(webhookEvents)
    .values({
      source,
      eventId: event.eventId,
      type: event.status?.state ?? "notification",
      payload: { requestId: event.requestId, jobId: job.id, state: event.status?.state ?? null },
    })
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });
  if (!inserted.length) {
    const [seen] = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, event.eventId)))
      .limit(1);
    if (seen?.processedAt) return { ok: true, jobId: job.id };
  }

  const mark = (values: { processedAt?: Date; error?: string | null }) =>
    db
      .update(webhookEvents)
      .set(values)
      .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, event.eventId)));
  try {
    if (job.status === "running") {
      if (event.status) await applyProviderStatus(job, event.status);
      else await syncJob(job.id, { force: true });
    }
    await mark({ processedAt: new Date(), error: null });
  } catch (err) {
    await mark({ error: errorMessage(err).slice(0, 500) }).catch(() => undefined);
    throw err;
  }
  return { ok: true, jobId: job.id };
}

/* ───────────────────────────── cancel / fail ───────────────────────────── */

export async function cancelJob(userId: string, jobId: string): Promise<JobRow> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!job) throw errors.notFound("Job");
  if (isTerminal(job.status)) return job;
  const ref = refOf(job);
  if (ref) {
    await getAIProvider(ref.provider)
      .cancel(ref)
      .catch((e) => console.warn(`[jobs] provider cancel failed for ${jobId}:`, errorMessage(e)));
  }
  return failJob(job.id, MSG.canceled, "canceled", "canceled");
}

/** Mark a job failed and refund the unrefunded remainder of its credits. Idempotent. */
export async function failJob(
  jobId: string,
  error: string,
  errorCode?: string,
  status?: "failed" | "canceled" | "blocked",
  opts?: { detail?: string },
): Promise<JobRow> {
  const finalStatus = status ?? "failed";
  const transitioned = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({
        status: finalStatus,
        error,
        errorCode: errorCode ?? null,
        completedAt: new Date(),
        output: opts?.detail
          ? sql`(coalesce(${jobs.output}, '{}'::jsonb) - 'finalizing') || jsonb_build_object('failureDetail', ${opts.detail.slice(0, 1000)}::text)`
          : sql`coalesce(${jobs.output}, '{}'::jsonb) - 'finalizing'`,
      })
      .where(and(eq(jobs.id, jobId), inArray(jobs.status, ACTIVE_STATUSES)))
      .returning();
    if (row?.batchId) await bumpBatchCounters(tx, row.batchId, finalStatus);
    return row;
  });

  let job = transitioned ?? (await loadJob(jobId));
  // Refund whatever is left (also heals a previous call that died before refunding).
  if (job.status !== "succeeded" && isTerminal(job.status) && job.creditsRefunded < job.creditsCharged) {
    await refundJob(jobId, {
      amount: job.creditsCharged - job.creditsRefunded,
      tag: "final",
      note: job.status === "canceled" ? "Job canceled" : job.status === "blocked" ? "Blocked by safety filter" : "Job failed",
    });
    job = await loadJob(jobId);
  }

  if (transitioned) {
    try {
      await getHandler(job.type).onFailed?.({ job, error });
    } catch (err) {
      console.error(`[jobs] onFailed hook failed for ${jobId}:`, err);
    }
  }
  return job;
}

/* ───────────────────────────── cron / worker ───────────────────────────── */

/** Cron/worker: sync running jobs not updated recently; fail jobs stuck too long (with refund). */
export async function pollStaleJobs(opts?: { limit?: number; olderThanSec?: number }): Promise<{ checked: number; completed: number; failed: number }> {
  const limit = opts?.limit ?? 25;
  const olderThanSec = opts?.olderThanSec ?? 10;
  let failed = 0;
  let completed = 0;

  const startedAt = sql`coalesce(${jobs.submittedAt}, ${jobs.createdAt})`;
  const stuck = await db
    .select()
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "queued"), sql`${jobs.createdAt} < now() - make_interval(secs => ${QUEUED_TIMEOUT_SEC}::int)`),
        and(
          eq(jobs.status, "running"),
          sql`${startedAt} < now() - make_interval(secs => case when ${jobs.type} = 'train' then ${TRAIN_TIMEOUT_SEC}::int else ${JOB_TIMEOUT_SEC}::int end)`,
        ),
      ),
    )
    .limit(limit);
  for (const job of stuck) {
    const ref = refOf(job);
    if (ref) await getAIProvider(ref.provider).cancel(ref).catch(() => undefined);
    const row = await failJob(job.id, MSG.timeout, "timeout");
    if (row.status === "failed") failed++;
  }

  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "running"),
        or(isNull(jobs.lastPolledAt), sql`${jobs.lastPolledAt} < now() - make_interval(secs => ${olderThanSec}::int)`),
      ),
    )
    .orderBy(sql`${jobs.lastPolledAt} asc nulls first`)
    .limit(limit);
  const results = await mapLimit(stale, POLL_CONCURRENCY, async ({ id }) => {
    try {
      return await syncJob(id);
    } catch (err) {
      console.error(`[jobs] poll failed for ${id}:`, err);
      return null;
    }
  });
  for (const row of results) {
    if (!row) continue;
    if (row.status === "succeeded" || row.status === "blocked") completed++;
    else if (row.status === "failed" || row.status === "canceled") failed++;
  }

  await repairStaleBatches().catch((err) => console.error("[jobs] batch repair failed:", err));
  return { checked: stale.length, completed, failed };
}
