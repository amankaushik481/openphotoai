/**
 * Real-Postgres regression test (PGlite has a single connection and can't reproduce lock ordering):
 * concurrent job creation for the same user must not deadlock (jobs.user_id FK KEY SHARE vs debit
 * FOR UPDATE). Runs only when TEST_POSTGRES_URL points at a disposable Postgres database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";
import { setDb, type Database } from "@/db";
import * as schema from "@/db/schema";
import { createTestModel, createTestUser } from "../../helpers/factories";
import { useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);

const url = process.env.TEST_POSTGRES_URL;

describe.skipIf(!url)("job creation on real Postgres", () => {
  let client: ReturnType<typeof postgres>;
  useTempStorage();

  beforeAll(async () => {
    client = postgres(url!, { max: 10, onnotice: () => {} });
    const db = drizzle(client, { schema, casing: "snake_case" });
    await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    setDb(db as unknown as Database);
  });

  afterAll(async () => {
    setDb(undefined);
    await client?.end({ timeout: 5 });
  });

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
