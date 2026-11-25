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
});
