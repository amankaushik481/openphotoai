import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { batches, creditLedger, jobs, media, moderationEvents, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { setProviderOverrides } from "@/providers/registry";
import { getBalance } from "@/server/credits/ledger";
import { AppError } from "@/server/http";
import { readAiLabel } from "@/server/images/process";
import {
  cancelJob,
  createBatch,
  createJob,
  failJob,
  getJobForUser,
  pollStaleJobs,
  syncJob,
  toJobDTO,
} from "@/server/jobs/engine";
import { getStorage } from "@/server/storage";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { overrideMockAI, resetSafety, safetyMock, safetyState, useTempStorage, BLOCKED_WORD } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let u: UserRow;
let modelId: string;
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  u = await createTestUser({ credits: 20, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
});
afterEach(() => {
  setProviderOverrides(null);
  vi.restoreAllMocks();
});

const gen = (over: Partial<Extract<JobInput, { type: "generate" }>> = {}): JobInput =>
  ({ type: "generate", modelId, prompt: "studio portrait of {subject}", numImages: 2, quality: "standard", aspectRatio: "4:5", ...over }) as JobInput;

async function jobMedia(jobId: string) {
  return db.select().from(media).where(eq(media.jobId, jobId));
}

async function reloadUser(id: string) {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, id));
  return row!;
}

describe("createJob -> syncJob lifecycle", () => {
  it("charges, submits, completes and stores labeled media", async () => {
    const free = await createTestUser({ credits: 10, plan: "free", hasPaid: false });
    const freeModel = await createTestModel(free.id);
    const job = await createJob(free, gen({ modelId: freeModel.id }));
    expect(job.status).toBe("running");
    expect(job.provider).toBe("mock");
    expect(job.providerRequestId).toBeTruthy();
    expect(job.creditsCharged).toBe(2);
    expect(job.costUsd).toBeGreaterThan(0);
    expect(await getBalance(free.id)).toBe(8);

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.progress).toBe(100);
    expect(done.output?.mediaIds).toHaveLength(2);
    expect(done.output?.finalPrompt).toContain(freeModel.triggerWord);

    const rows = await jobMedia(job.id);
    expect(rows).toHaveLength(2);
    for (const m of rows) {
      expect(m.userId).toBe(free.id);
      expect(m.modelId).toBe(freeModel.id);
      expect(m.watermarked).toBe(true); // free tier, never paid
      expect(m.scores?.overall).toBeGreaterThan(0);
      expect(m.moderation?.allowed).toBe(true);
      expect(m.prompt).toContain(freeModel.triggerWord);
      expect(await getStorage().exists(m.storageKey)).toBe(true);
      expect(await getStorage().exists(m.thumbKey!)).toBe(true);
      const label = await readAiLabel(await getStorage().get(m.storageKey));
      expect(label).not.toBeNull();
    }

    const dto = await toJobDTO(done);
    expect(dto.status).toBe("succeeded");
    expect(dto.media).toHaveLength(2);
    expect(dto.media[0]!.url).toMatch(/^http/);
    expect(dto.media[0]!.downloadUrl).toMatch(/^http/);
    expect(dto.creditsCharged).toBe(2);
    expect(await getBalance(free.id)).toBe(8);
  });

  it("getJobForUser lazily syncs and enforces ownership", async () => {
    const job = await createJob(u, gen());
    const other = await createTestUser();
    await expect(getJobForUser(other.id, job.id)).rejects.toMatchObject({ code: "not_found" });
    const synced = await getJobForUser(u.id, job.id);
    expect(synced.status).toBe("succeeded");
  });

  it("blocks disallowed prompts before charging", async () => {
    await expect(createJob(u, gen({ prompt: `photo with ${BLOCKED_WORD}` }))).rejects.toMatchObject({ code: "content_blocked" });
    expect(await db.select().from(jobs)).toHaveLength(0);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("charges instant-mode models double and sends reference photos", async () => {
    const { identityModels } = await import("@/db/schema");
    await db.update(identityModels).set({ metadata: { mode: "instant" }, providerModelRef: null }).where(eq(identityModels.id, modelId));
    const { trainingPhotos } = await import("@/db/schema");
    const { pngBytes } = await import("./fixtures");
    const key = `users/${u.id}/models/${modelId}/photos/p1.jpg`;
    await getStorage().put(key, await pngBytes(), { contentType: "image/png" });
    await db.insert(trainingPhotos).values({ modelId, userId: u.id, storageKey: key, width: 64, height: 64, status: "accepted" });

    const submitGenerate = vi.fn();
    const provider = overrideMockAI();
    const original = provider.submitGenerate;
    provider.submitGenerate = async (input, opts) => {
      submitGenerate(input);
      return original(input, opts);
    };
    const job = await createJob(u, gen({ numImages: 2 }));
    expect(job.creditsCharged).toBe(4);
    const sent = submitGenerate.mock.calls[0]![0];
    expect(sent.identity.modelRef).toBe("");
    expect(sent.identity.referenceImageUrls).toHaveLength(1);
  });

  it("re-renders a draft at full quality with the same seed", async () => {
    const draftJob = await createJob(u, gen({ quality: "draft", numImages: 1, seed: 1234 }));
    expect(draftJob.creditsCharged).toBe(0);
    await syncJob(draftJob.id);
    const [draft] = await jobMedia(draftJob.id);
    expect(draft!.isDraft).toBe(true);

    await expect(createJob(u, gen({ fromDraftMediaId: draft!.id, quality: "draft" }))).rejects.toMatchObject({
      code: "validation_error",
    });
    const full = await createJob(u, gen({ fromDraftMediaId: draft!.id, quality: "standard", prompt: undefined }));
    expect(full.creditsCharged).toBe(1);
    const plan = full.output?.plan as { seed: number; prompt: string; numImages: number };
    expect(plan.seed).toBe(draft!.seed);
    expect(plan.numImages).toBe(1);
    const done = await syncJob(full.id);
    const [rendered] = await jobMedia(done.id);
    expect(rendered!.isDraft).toBe(false);
    expect(rendered!.parentMediaId).toBe(draft!.id);
  });

  it("caps free drafts per day for users who never paid", async () => {
    const free = await createTestUser({ credits: 0, plan: "studio", hasPaid: false });
    const m = await createTestModel(free.id);
    for (let i = 0; i < 5; i++) await createJob(free, gen({ modelId: m.id, quality: "draft", numImages: 1 }));
    await expect(createJob(free, gen({ modelId: m.id, quality: "draft", numImages: 1 }))).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("enforces the plan's concurrency limit", async () => {
    const free = await createTestUser({ credits: 20, plan: "free" });
    const m = await createTestModel(free.id);
    const stuck = gen({ modelId: m.id, prompt: "portrait [mock:stuck]", numImages: 1 });
    await createJob(free, stuck);
    await createJob(free, stuck);
    await expect(createJob(free, stuck)).rejects.toMatchObject({ code: "plan_limit" });
  });
});

describe("idempotency", () => {
  it("returns the existing job on replay and charges once", async () => {
    const a = await createJob(u, gen(), { idempotencyKey: "key-1" });
    const b = await createJob(u, gen(), { idempotencyKey: "key-1" });
    expect(b.id).toBe(a.id);
    expect(await getBalance(u.id)).toBe(18);
  });

  it("handles concurrent replays of the same key", async () => {
    const [a, b] = await Promise.all([
      createJob(u, gen(), { idempotencyKey: "key-2" }),
      createJob(u, gen(), { idempotencyKey: "key-2" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(jobs)).toHaveLength(1);
    expect(await getBalance(u.id)).toBe(18);
  });
});

describe("credits and refunds", () => {
  it("rejects insufficient credits without leaving a job behind", async () => {
    const poor = await createTestUser({ credits: 1, plan: "pro" });
    const m = await createTestModel(poor.id);
    await expect(createJob(poor, gen({ modelId: m.id, numImages: 4 }))).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    expect(await db.select().from(jobs).where(eq(jobs.userId, poor.id))).toHaveLength(0);
    expect(await getBalance(poor.id)).toBe(1);
  });

  it("refunds when the provider rejects the submission", async () => {
    overrideMockAI({
      submitGenerate: async () => {
        throw new Error("boom");
      },
    });
    const err = await createJob(u, gen()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("provider_error");
    const [row] = await db.select().from(jobs).where(eq(jobs.userId, u.id));
    expect(row!.status).toBe("failed");
    expect(row!.creditsRefunded).toBe(2);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("refunds when the provider job fails", async () => {
    const job = await createJob(u, gen({ prompt: "portrait [mock:fail]" }));
    expect(await getBalance(u.id)).toBe(18);
    const done = await syncJob(job.id);
    expect(done.status).toBe("failed");
    expect(done.errorCode).toBe("provider_error");
    expect(done.creditsRefunded).toBe(2);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("marks all-blocked jobs as blocked with a full refund", async () => {
    const job = await createJob(u, gen({ prompt: "portrait [mock:nsfw-output]", numImages: 2 }));
    const done = await syncJob(job.id);
    expect(done.status).toBe("blocked");
    expect(done.error).toBe("All results were blocked by our safety filter");
    expect(done.creditsRefunded).toBe(2);
    expect(await jobMedia(job.id)).toHaveLength(0);
    expect(await getBalance(u.id)).toBe(20);
    const dto = await toJobDTO(done);
    expect(dto.media).toHaveLength(0);
  });

  it("refunds blocked outputs proportionally and never downloads provider-flagged ones", async () => {
    const fetched: string[] = [];
    const provider = overrideMockAI();
    const { getStatus, fetchOutput } = provider;
    provider.getStatus = async (ref) => {
      const s = await getStatus(ref);
      if (s.state === "succeeded" && s.output.images) s.output.images[0] = { ...s.output.images[0]!, nsfw: true };
      return s;
    };
    provider.fetchOutput = async (url) => {
      fetched.push(url);
      return fetchOutput(url);
    };
    const job = await createJob(u, gen({ numImages: 4 }));
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.output?.blockedCount).toBe(1);
    expect(await jobMedia(job.id)).toHaveLength(3);
    expect(fetched).toHaveLength(3);
    expect(fetched.some((url) => url.endsWith("/0"))).toBe(false);
    expect(done.creditsRefunded).toBe(1);
    expect(await getBalance(u.id)).toBe(17);
    const events = await db.select().from(moderationEvents).where(eq(moderationEvents.kind, "output_blocked"));
    expect(events).toHaveLength(1);
    expect(events[0]!.jobId).toBe(job.id);
  });

  it("applies the likeness guarantee (hide + refund) and the best-shots picker", async () => {
    safetyState.likeness = [0.92, 0.3, 0.9, 0.88];
    const job = await createJob(u, gen({ numImages: 4 }));
    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const rows = await jobMedia(job.id);
    expect(rows).toHaveLength(4);
    const low = rows.find((r) => r.scores?.likeness === 0.3)!;
    expect(low.hidden).toBe(true);
    expect(rows.filter((r) => !r.hidden).length).toBeGreaterThanOrEqual(2);
    expect(done.creditsRefunded).toBe(1);
    const refunds = await db.select().from(creditLedger).where(and(eq(creditLedger.jobId, job.id), eq(creditLedger.reason, "job_refund")));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.idempotencyKey).toBe(`job:${job.id}:refund:likeness:1`);
    // Visible shots come first in the DTO.
    const dto = await toJobDTO(done);
    expect(dto.media.at(-1)!.hidden).toBe(true);
  });

  it("cancels a running job with a refund", async () => {
    const job = await createJob(u, gen({ prompt: "portrait [mock:stuck]" }));
    const other = await createTestUser();
    await expect(cancelJob(other.id, job.id)).rejects.toMatchObject({ code: "not_found" });
    const canceled = await cancelJob(u.id, job.id);
    expect(canceled.status).toBe("canceled");
    expect(canceled.creditsRefunded).toBe(2);
    expect(await getBalance(u.id)).toBe(20);
    // Idempotent: canceling / failing again changes nothing.
    expect((await cancelJob(u.id, job.id)).status).toBe("canceled");
    expect((await failJob(job.id, "again")).status).toBe("canceled");
    expect(await getBalance(u.id)).toBe(20);
  });
});

describe("concurrency", () => {
  it("ingests once when polls and webhooks race", async () => {
    const provider = overrideMockAI();
    const fetchOutput = vi.spyOn(provider, "fetchOutput");
    const job = await createJob(u, gen({ numImages: 2 }));
    const results = await Promise.all([
      syncJob(job.id, { force: true }),
      syncJob(job.id, { force: true }),
      syncJob(job.id, { force: true }),
    ]);
    expect(results.some((r) => r.status === "succeeded")).toBe(true);
    const final = await syncJob(job.id, { force: true });
    expect(final.status).toBe("succeeded");
    expect(await jobMedia(job.id)).toHaveLength(2);
    expect(fetchOutput).toHaveBeenCalledTimes(2);
    expect(final.output?.finalizing).toBeUndefined();
  });

  it("throttles provider polling unless forced", async () => {
    const provider = overrideMockAI();
    const getStatus = vi.spyOn(provider, "getStatus");
    const job = await createJob(u, gen({ prompt: "portrait [mock:stuck]" }));
    await syncJob(job.id);
    await syncJob(job.id);
    expect(getStatus).toHaveBeenCalledTimes(1);
    await syncJob(job.id, { force: true });
    expect(getStatus).toHaveBeenCalledTimes(2);
  });
});

describe("pollStaleJobs", () => {
  it("completes stale running jobs", async () => {
    const job = await createJob(u, gen());
    const r = await pollStaleJobs({ olderThanSec: 0 });
    expect(r.checked).toBe(1);
    expect(r.completed).toBe(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.status).toBe("succeeded");
  });

  it("times out jobs stuck too long and refunds them", async () => {
    const job = await createJob(u, gen({ prompt: "portrait [mock:stuck]" }));
    const longAgo = new Date(Date.now() - 3 * 3600 * 1000);
    await db.update(jobs).set({ submittedAt: longAgo, createdAt: longAgo }).where(eq(jobs.id, job.id));
    const r = await pollStaleJobs();
    expect(r.failed).toBe(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.status).toBe("failed");
    expect(row!.error).toMatch(/timed out/);
    expect(await getBalance(u.id)).toBe(20);
  });
});

describe("createBatch", () => {
  it("spreads a pack over single-image jobs and tracks batch counters", async () => {
    const { batch, jobs: created } = await createBatch(u, { modelId, packId: "linkedin-headshots", count: 3, quality: "standard" });
    expect(created).toHaveLength(3);
    expect(batch.total).toBe(3);
    const indexes = created.map((j) => (j.input as { packPromptIndex: number }).packPromptIndex);
    expect(new Set(indexes).size).toBe(3);
    expect(created.every((j) => j.batchId === batch.id && j.creditsCharged === 1)).toBe(true);
    expect(await getBalance(u.id)).toBe(17);

    await syncJob(created[0]!.id);
    let [row] = await db.select().from(batches).where(eq(batches.id, batch.id));
    expect(row).toMatchObject({ completed: 1, failed: 0, status: "running" });

    await cancelJob(u.id, created[1]!.id);
    await syncJob(created[2]!.id);
    [row] = await db.select().from(batches).where(eq(batches.id, batch.id));
    expect(row).toMatchObject({ completed: 2, failed: 1, status: "completed" });
    const batchMedia = await db.select().from(media).where(eq(media.batchId, batch.id));
    expect(batchMedia).toHaveLength(2);
    expect(batchMedia.every((m) => m.packId === "linkedin-headshots")).toBe(true);
  });

  it("stops when credits run out and shrinks the batch", async () => {
    const poor = await createTestUser({ credits: 2, plan: "pro" });
    const m = await createTestModel(poor.id);
    const r = await createBatch(poor, { modelId: m.id, packId: "studio-portrait", count: 6, quality: "standard" });
    expect(r.jobs).toHaveLength(2);
    expect(r.requested).toBe(6);
    expect(r.stoppedReason).toBe("insufficient_credits");
    expect(r.batch.total).toBe(2);
    expect((await reloadUser(poor.id)).credits).toBe(0);
  });

  it("enforces the plan's batch size and fails cleanly with no credits", async () => {
    const free = await createTestUser({ credits: 0, plan: "free" });
    const m = await createTestModel(free.id);
    await expect(createBatch(free, { modelId: m.id, packId: "studio-portrait", count: 11, quality: "standard" })).rejects.toMatchObject({
      code: "plan_limit",
    });
    await expect(createBatch(free, { modelId: m.id, packId: "studio-portrait", count: 2, quality: "standard" })).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    expect(await db.select().from(batches).where(eq(batches.userId, free.id))).toHaveLength(0);
  });
});

describe("safety hooks", () => {
  it("only moderates the user's own prompt text", async () => {
    await createJob(u, gen({ prompt: "on a beach at sunset" }));
    expect(safetyMock.assertTextAllowed).toHaveBeenCalledWith(["on a beach at sunset"], expect.objectContaining({ userId: u.id }));
    safetyMock.assertTextAllowed.mockClear();
    await createJob(u, gen({ prompt: undefined, packId: "linkedin-headshots", numImages: 1 }));
    expect(safetyMock.assertTextAllowed).not.toHaveBeenCalled();
  });
});
