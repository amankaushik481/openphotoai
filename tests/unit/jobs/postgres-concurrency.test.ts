/**
 * Real-Postgres regression tests (PGlite has a single connection and can't reproduce lock ordering):
 * concurrent job creation for the same user must not deadlock (jobs.user_id FK KEY SHARE vs debit
 * FOR UPDATE). Runs only when TEST_POSTGRES_URL points at a disposable Postgres server; this file
 * uses its own database (tests/helpers/postgres.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { createTestModel, createTestUser } from "../../helpers/factories";
import { setupPostgres } from "../../helpers/postgres";
import { useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);

const pg = setupPostgres("jobs");

describe.skipIf(!pg.enabled)("job creation on real Postgres", () => {
  useTempStorage();

  it("creates a full pack batch (parallel child jobs) without deadlocks", async () => {
    const { createBatch } = await import("@/server/jobs/engine");
    const user = await createTestUser({ credits: 500, plan: "studio", hasPaid: true });
    const model = await createTestModel(user.id);
    const res = await createBatch(user, { modelId: model.id, packId: "linkedin-headshots", count: 12, quality: "standard" });
    expect((res as { stoppedReason?: string }).stoppedReason).toBeUndefined();
    expect(res.jobs).toHaveLength(12);
  });

  it("creates many paid jobs for one user concurrently without deadlocks", async () => {
    const { createJob } = await import("@/server/jobs/engine");
    const user = await createTestUser({ credits: 500, plan: "studio", hasPaid: true });
    const model = await createTestModel(user.id);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        createJob(
          user,
          { type: "generate", modelId: model.id, prompt: `portrait ${i}`, numImages: 1, quality: "standard", aspectRatio: "4:5" },
          { skipRateLimit: true, batchId: null },
        ),
      ),
    );
    const failures = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason));
    expect(failures.filter((f) => /deadlock/i.test(f))).toEqual([]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(8 - failures.length);
  });

  it("settles every job exactly once when completions, cancels and timeouts race (batch counters, refunds, media)", async () => {
    const { cancelJob, createBatch, failJob, syncJob } = await import("@/server/jobs/engine");
    const { db } = await import("@/db");
    const { batches, creditLedger, jobs, media, user: userTable } = await import("@/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const user = await createTestUser({ credits: 500, plan: "studio", hasPaid: true });
    const model = await createTestModel(user.id);
    const { batch, jobs: children } = await createBatch(user, { modelId: model.id, packId: "linkedin-headshots", count: 10, quality: "standard" });

    const { handleAIWebhook } = await import("@/server/jobs/engine");
    const { MOCK_WEBHOOK_HEADER, signMockWebhook } = await import("@/providers/mock/ai");
    // The provider's completion webhook, delivered twice (providers retry), racing the pollers.
    const webhook = (requestId: string) => {
      const rawBody = JSON.stringify({ requestId, status: "completed" });
      const headers = new Headers({ [MOCK_WEBHOOK_HEADER]: signMockWebhook(rawBody) });
      return handleAIWebhook("mock", { rawBody, url: "http://localhost:3000/api/webhooks/ai/mock", headers });
    };
    const races = children.flatMap((job, i) => [
      syncJob(job.id, { force: true }),
      webhook(job.providerRequestId!),
      webhook(job.providerRequestId!),
      i % 3 === 0 ? cancelJob(user.id, job.id) : i % 3 === 1 ? failJob(job.id, "timed out", "timeout") : syncJob(job.id, { force: true }),
    ]);
    const settled = await Promise.allSettled(races);
    const errors = settled.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason));
    expect(errors).toEqual([]);

    const rows = await db.select().from(jobs).where(eq(jobs.batchId, batch.id));
    for (const job of rows) {
      expect(["succeeded", "canceled", "failed"]).toContain(job.status);
      const [ledger] = await db
        .select({ sum: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
        .from(creditLedger)
        .where(eq(creditLedger.jobId, job.id));
      expect(Number(ledger!.sum), job.id).toBe(job.creditsRefunded - job.creditsCharged);
      const kept = await db.$count(media, eq(media.jobId, job.id));
      if (job.status === "succeeded") {
        expect(job.creditsRefunded).toBe(0);
        expect(kept).toBe(1);
      } else {
        expect(job.creditsRefunded).toBe(job.creditsCharged);
        expect(kept).toBe(0);
      }
    }
    const [b] = await db.select().from(batches).where(eq(batches.id, batch.id));
    expect(b!.completed + b!.failed).toBe(rows.length);
    expect(b!.completed).toBe(rows.filter((r) => r.status === "succeeded").length);
    expect(b!.status).not.toBe("running");
    const [u] = await db.select({ credits: userTable.credits }).from(userTable).where(eq(userTable.id, user.id));
    const [{ sum } = { sum: 0 }] = await db
      .select({ sum: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, user.id));
    // The 500 starting credits were set on the row directly (no ledger entry).
    expect(Number(sum)).toBe(u!.credits - 500);
  });
});
