import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { setProviderOverrides } from "@/providers/registry";
import type { ProviderJobRef, ProviderJobStatus } from "@/providers/types";
import { completeAfterResponse, syncRunningJobs } from "@/server/jobs/api";
import { createJob, syncIntervalsSec, syncJob } from "@/server/jobs/engine";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { overrideMockAI, resetSafety, useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);
vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("./registry-fallback")).fallbackRegistry),
);

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
  u = await createTestUser({ credits: 50, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
});
afterEach(() => {
  setProviderOverrides(null);
  vi.restoreAllMocks();
});

const gen = (): JobInput =>
  ({ type: "generate", modelId, prompt: "studio portrait of {subject}", numImages: 1, quality: "standard", aspectRatio: "4:5" }) as JobInput;

const agePoll = (jobId: string, seconds: number) =>
  db
    .update(jobs)
    .set({ lastPolledAt: sql`now() - make_interval(secs => ${seconds}::int)` })
    .where(eq(jobs.id, jobId));

describe("provider poll throttle", () => {
  it("polls slower when webhooks deliver results (training slowest)", () => {
    expect(syncIntervalsSec(false)).toEqual({ base: 3, train: 3 });
    expect(syncIntervalsSec(true)).toEqual({ base: 20, train: 60 });
  });

  it("calls the provider at most once per interval per job, however many viewers poll", async () => {
    const getStatus = vi.fn(async (): Promise<ProviderJobStatus> => ({ state: "running", progress: 0.4 }));
    overrideMockAI({ getStatus });
    const job = await createJob(u, gen());

    await syncJob(job.id);
    await Promise.all([syncJob(job.id), syncJob(job.id), syncJob(job.id)]);
    expect(getStatus).toHaveBeenCalledTimes(1);

    await agePoll(job.id, 4);
    const row = await syncJob(job.id);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(row.progress).toBe(40);
  });

  it("does not poll a job whose outputs are being ingested (active finalization lease)", async () => {
    const getStatus = vi.fn(async (): Promise<ProviderJobStatus> => ({ state: "running" }));
    overrideMockAI({ getStatus });
    const job = await createJob(u, gen());
    await db
      .update(jobs)
      .set({ output: sql`jsonb_build_object('finalizing', jsonb_build_object('token', 'other', 'at', now()))` })
      .where(eq(jobs.id, job.id));

    await syncJob(job.id, { force: true });
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("rotates lazy batch syncs: least recently polled jobs first", async () => {
    const getStatus = vi.fn<(ref: ProviderJobRef) => Promise<ProviderJobStatus>>(async () => ({ state: "running" }));
    overrideMockAI({ getStatus });
    const rows = await db
      .insert(jobs)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          userId: u.id,
          type: "generate" as const,
          status: "running" as const,
          input: gen(),
          provider: "mock" as const,
          providerEndpoint: "mock/generate",
          providerRequestId: `req-${i}`,
        })),
      )
      .returning();
    // The first two were polled recently; the rest never.
    await agePoll(rows[0]!.id, 1);
    await agePoll(rows[1]!.id, 1);
    const fresh = await db.select().from(jobs).where(eq(jobs.userId, u.id));
    await syncRunningJobs(fresh);
    const polled = getStatus.mock.calls.map(([ref]) => ref.requestId);
    expect(polled).toHaveLength(10);
    expect(polled).not.toContain(rows[0]!.providerRequestId);
    expect(polled).not.toContain(rows[1]!.providerRequestId);
  });
});

describe("deferred completion", () => {
  it("answers the poll right away and ingests when the deferred task runs", async () => {
    const job = await createJob(u, gen());
    const tasks: Array<() => Promise<unknown>> = [];
    const row = await syncJob(job.id, { deferCompletion: (task) => (tasks.push(task), true) });
    expect(row.status).toBe("running");
    expect(tasks).toHaveLength(1);

    await tasks[0]!();
    const [done] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(done).toMatchObject({ status: "succeeded", progress: 100 });
    expect(done!.output?.mediaIds).toHaveLength(1);
  });

  it("completes inline when the caller can't defer (outside a request scope)", async () => {
    expect(completeAfterResponse()(async () => undefined)).toBe(false);
    const job = await createJob(u, gen());
    const row = await syncJob(job.id, { deferCompletion: completeAfterResponse() });
    expect(row.status).toBe("succeeded");
  });
});
