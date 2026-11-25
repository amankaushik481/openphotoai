import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { batches, jobs } from "@/db/schema";
import { setProviderOverrides } from "@/providers/registry";
import { getBalance } from "@/server/credits/ledger";
import { createBatch, createJob } from "@/server/jobs/engine";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { resetSafety, useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);
vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("./registry-fallback")).fallbackRegistry),
);

let cleanup: () => Promise<void>;
beforeAll(async () => {
  cleanup = await useTempStorage();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
});

const generate = (modelId: string): JobInput =>
  ({
    type: "generate",
    modelId,
    prompt: "studio portrait of {subject}",
    numImages: 1,
    quality: "standard",
    aspectRatio: "4:5",
  }) as JobInput;

// Regression (review): the concurrency check moved under the user-row lock, so the second of two
// parallel requests with one Idempotency-Key waited for the first, then counted the first's job and
// failed with plan_limit, although "replays return the original" (the job was created and charged).
it("a concurrent replay of one Idempotency-Key near the plan limit returns the original job", async () => {
  const u = await createTestUser({ credits: 50, plan: "free" }); // up to 2 jobs at once
  const model = await createTestModel(u.id);
  await createJob(u, generate(model.id)); // one running: one slot left
  const before = await getBalance(u.id);

  const results = await Promise.allSettled([
    createJob(u, generate(model.id), { idempotencyKey: "k" }),
    createJob(u, generate(model.id), { idempotencyKey: "k" }),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  const [a, b] = results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value);
  expect(a!.id).toBe(b!.id);
  const keyed = await db.select().from(jobs).where(eq(jobs.idempotencyKey, "k"));
  expect(keyed).toHaveLength(1);
  expect(await getBalance(u.id)).toBe(before - keyed[0]!.creditsCharged); // charged once
});

it("a concurrent replay of one batch Idempotency-Key hands back the same batch", async () => {
  const u = await createTestUser({ credits: 50, plan: "free" });
  const model = await createTestModel(u.id);
  await createJob(u, generate(model.id)); // one running: one slot left
  const req = { modelId: model.id, packId: "linkedin-headshots", count: 1, quality: "standard" as const };

  const results = await Promise.allSettled([
    createBatch(u, req, { idempotencyKey: "b" }),
    createBatch(u, req, { idempotencyKey: "b" }),
  ]);
  expect(results.map((r) => (r.status === "rejected" ? String((r.reason as Error).message) : "ok"))).toEqual([
    "ok",
    "ok",
  ]);
  const [a, b] = results.map((r) => (r as PromiseFulfilledResult<{ batch: { id: string } }>).value);
  expect(a!.batch.id).toBe(b!.batch.id);
  expect(await db.select().from(batches).where(eq(batches.userId, u.id))).toHaveLength(1);
});
