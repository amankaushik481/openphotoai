/** Job-side regressions from the payments review (docs/reviews/payments.md), ported from its probes. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { media, user } from "@/db/schema";
import { setProviderOverrides } from "@/providers/registry";
import { applyCredit, getBalance } from "@/server/credits/ledger";
import { updateMedia } from "@/server/gallery/media";
import { createJob, syncJob } from "@/server/jobs/engine";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { resetSafety, safetyState, useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);

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

const generate = (modelId: string, over: Partial<Extract<JobInput, { type: "generate" }>> = {}): JobInput =>
  ({ type: "generate", modelId, prompt: "portrait of {subject}", quality: "draft", numImages: 4, aspectRatio: "4:5", ...over }) as JobInput;

describe("PAY-8 the free-draft allowance counts images, not jobs", () => {
  it("a never-paid user gets 5 draft images a day, not 5 jobs × 4", async () => {
    const free = await createTestUser({ credits: 0, plan: "free", hasPaid: false });
    const m = await createTestModel(free.id);

    const first = await syncJob((await createJob(free, generate(m.id))).id);
    expect(first.output?.mediaIds).toHaveLength(4);

    // 1 left: a 4-image request is refused without burning the last one…
    await expect(createJob(free, generate(m.id))).rejects.toMatchObject({
      code: "validation_error",
      details: { draftsRemaining: 1 },
    });
    // …which a 1-image request can still use.
    await createJob(free, generate(m.id, { numImages: 1 }));
    await expect(createJob(free, generate(m.id, { numImages: 1 }))).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("PAY-7 a likeness-refunded photo can't be kept", () => {
  it("is discarded, so it can't be unhidden, downloaded or shared", async () => {
    const u = await createTestUser({ credits: 20, plan: "pro", hasPaid: true });
    const m = await createTestModel(u.id);
    safetyState.likeness = [0.1, 0.92];
    const job = await createJob(u, generate(m.id, { quality: "standard", numImages: 2 }));
    const done = await syncJob(job.id);
    expect(done).toMatchObject({ status: "succeeded", creditsCharged: 2, creditsRefunded: 1 });
    expect(await getBalance(u.id)).toBe(19);

    const rows = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scores?.likeness).toBe(0.92);
    // The kept photo behaves as before.
    expect((await updateMedia(u.id, rows[0]!.id, { hidden: false })).hidden).toBe(false);
  });
});

describe("PAY-9 a negative balance blocks spending", () => {
  it("refuses every job, free drafts included, until the balance is settled", async () => {
    const u = await createTestUser({ credits: 0, plan: "free", hasPaid: true });
    const m = await createTestModel(u.id);
    await applyCredit({ userId: u.id, delta: -50, reason: "purchase_reversal", idempotencyKey: "refund:test" });
    const [owner] = await db.select().from(user).where(eq(user.id, u.id));
    await expect(createJob(owner!, generate(m.id, { numImages: 1 }))).rejects.toMatchObject({
      code: "insufficient_credits",
      details: { balance: -50 },
    });
  });
});
