import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { creditLedger, jobs, moderationEvents } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { debitForJob, refundJob } from "@/server/credits/ledger";
import { getAdminJobDetail, isTerminalJobStatus, listJobs, refundJobAdmin } from "@/server/admin";
import { createTestDb, createTestJob, createTestMedia, createTestUser } from "../../helpers/factories";

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
    const job = await chargedJob(2, { status: "succeeded" });
    await refundJobAdmin(admin.id, job.id);
    await expect(refundJobAdmin(admin.id, job.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(refundJobAdmin(admin.id, "job_missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses jobs that are still queued or running (they may succeed, or are refunded when they fail)", async () => {
    for (const status of ["queued", "running"] as const) {
      const job = await chargedJob(4, { status });
      await expect(refundJobAdmin(admin.id, job.id)).rejects.toMatchObject({ code: "conflict" });
      const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
      expect(row!.creditsRefunded).toBe(0);
    }
    expect(isTerminalJobStatus("blocked")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
  });
});

describe("getAdminJobDetail (job inspector)", () => {
  it("collects the job, its ledger, outputs and safety events, and redacts provider weight references", async () => {
    const job = await chargedJob(6, {
      status: "succeeded",
      type: "train",
      output: {
        modelRef: "fal-lora-ref-123",
        finalPrompt: "a photo",
        plan: { identity: { url: "https://cdn.test/u/selfie.jpg?sig=x", key: "users/usr_1/photos/a.jpg" }, seeds: [1, 2] },
      },
    });
    await refundJob(job.id, { amount: 2, tag: "likeness", note: "Low likeness" });
    await createTestMedia(u.id, { jobId: job.id });
    await db.insert(moderationEvents).values({ userId: u.id, jobId: job.id, kind: "output_blocked", details: { n: 1 } });

    const detail = await getAdminJobDetail(job.id);
    expect(detail.job).toMatchObject({ id: job.id, userEmail: "u@example.com", status: "succeeded" });
    expect(detail.job.output).toEqual({
      modelRef: "[redacted]",
      finalPrompt: "a photo",
      plan: { identity: { url: "[redacted]", key: "[redacted]" }, seeds: [1, 2] },
    });
    expect(detail.ledger.map((e) => [e.reason, e.delta])).toEqual([
      ["job_debit", -6],
      ["job_refund", 2],
    ]);
    expect(detail.media).toHaveLength(1);
    expect(detail.events.map((e) => e.kind)).toEqual(["output_blocked"]);
    await expect(getAdminJobDetail("job_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});
