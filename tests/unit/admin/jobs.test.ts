import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { creditLedger, jobs } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { debitForJob, refundJob } from "@/server/credits/ledger";
import { listJobs, refundJobAdmin } from "@/server/admin";
import { createTestDb, createTestJob, createTestUser } from "../../helpers/factories";

let admin: UserRow;
let u: UserRow;

beforeEach(async () => {
  await createTestDb();
  admin = await createTestUser({ role: "admin" });
  u = await createTestUser({ credits: 20, email: "u@example.com" });
});

async function chargedJob(amount: number, overrides: Parameters<typeof createTestJob>[1] = {}) {
  const job = await createTestJob(u.id, { creditsCharged: amount, ...overrides });
  await debitForJob({ userId: u.id, jobId: job.id, amount });
  return job;
}

describe("listJobs", () => {
  it("filters by status, type and user, newest first with cost + credits columns", async () => {
    const other = await createTestUser();
    const failed = await createTestJob(u.id, { status: "failed", error: "provider exploded", costUsd: 0.035, createdAt: new Date(Date.now() - 1000) });
    await createTestJob(u.id, { status: "succeeded" });
    await createTestJob(other.id, { status: "failed" });

    const all = await listJobs();
    expect(all.jobs).toHaveLength(3);

    const mineFailed = await listJobs({ status: "failed", userId: u.id });
    expect(mineFailed.jobs).toEqual([
      expect.objectContaining({ id: failed.id, error: "provider exploded", userEmail: "u@example.com", creditsCharged: 0 }),
    ]);
    expect(mineFailed.jobs[0]!.costUsd).toBeCloseTo(0.035);
    expect((await listJobs({ type: "video" })).jobs).toHaveLength(0);

    const page1 = await listJobs({ limit: 2 });
    const page2 = await listJobs({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.jobs).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.jobs, ...page2.jobs].map((j) => j.id)).size).toBe(3);
  });
});

describe("refundJobAdmin", () => {
  it("refunds the unrefunded remainder, tagged admin and attributed to the admin", async () => {
    const job = await chargedJob(8, { status: "succeeded" });
    await refundJob(job.id, { amount: 3, tag: "likeness" });

    const result = await refundJobAdmin(admin.id, job.id, "Bad results");
    expect(result).toEqual({ refunded: 5, creditsRefunded: 8 });

    const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, `job:${job.id}:refund:admin`));
    expect(entry).toMatchObject({ delta: 5, reason: "job_refund", createdBy: admin.id, note: "Admin refund: Bad results" });
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0]!.creditsRefunded).toBe(8);
  });

  it("rejects jobs with nothing left to refund and unknown jobs", async () => {
    const job = await chargedJob(2);
    await refundJobAdmin(admin.id, job.id);
    await expect(refundJobAdmin(admin.id, job.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(refundJobAdmin(admin.id, "job_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});
