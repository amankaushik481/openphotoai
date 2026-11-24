import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { creditLedger, jobs } from "@/db/schema";
import {
  adminAdjust,
  applyCredit,
  debitForJob,
  getBalance,
  grantCredits,
  listLedger,
  refundJob,
} from "@/server/credits/ledger";
import { AppError } from "@/server/http";
import { createTestDb, createTestUser } from "../../helpers/db";
import { createTestJob } from "../../helpers/factories";

beforeEach(async () => {
  await createTestDb();
});

/** user.credits must always equal the sum of the user's ledger deltas. */
async function expectInvariant(userId: string) {
  const [{ total }] = (await db
    .select({ total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))) as [{ total: number }];
  expect(await getBalance(userId)).toBe(total);
  return total;
}

async function newUserWith(credits: number) {
  const u = await createTestUser();
  if (credits > 0) await grantCredits(u.id, credits, "purchase", `test:${u.id}:seed`);
  return u;
}

describe("grants and debits", () => {
  it("grants credits and records balanceAfter", async () => {
    const u = await createTestUser();
    expect(await grantCredits(u.id, 25, "signup_bonus", `signup:${u.id}`, "welcome")).toEqual({ applied: true, balance: 25 });
    const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id));
    expect(entry).toMatchObject({ delta: 25, balanceAfter: 25, reason: "signup_bonus", note: "welcome" });
    await expectInvariant(u.id);
  });

  it("debits for a job with key job:<id>:debit", async () => {
    const u = await newUserWith(10);
    expect(await debitForJob({ userId: u.id, jobId: "job_1", amount: 4 })).toEqual({ balance: 6 });
    const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, "job:job_1:debit"));
    expect(entry).toMatchObject({ delta: -4, balanceAfter: 6, reason: "job_debit", jobId: "job_1" });
    await expectInvariant(u.id);
  });

  it("writes nothing for a free (0 credit) job", async () => {
    const u = await newUserWith(3);
    expect(await debitForJob({ userId: u.id, jobId: "job_free", amount: 0 })).toEqual({ balance: 3 });
    expect(await db.select().from(creditLedger).where(eq(creditLedger.jobId, "job_free"))).toHaveLength(0);
  });

  it("refuses debits below zero with insufficient_credits and changes nothing", async () => {
    const u = await newUserWith(3);
    const err = await debitForJob({ userId: u.id, jobId: "job_big", amount: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "insufficient_credits", status: 402, details: { needed: 5, balance: 3 } });
    expect(await getBalance(u.id)).toBe(3);
    expect(await expectInvariant(u.id)).toBe(3);
  });

  it("allows purchase_reversal to go negative", async () => {
    const u = await newUserWith(10);
    await debitForJob({ userId: u.id, jobId: "job_spend", amount: 8 });
    const res = await applyCredit({ userId: u.id, delta: -10, reason: "purchase_reversal", idempotencyKey: "stripe:refund_1" });
    expect(res).toEqual({ applied: true, balance: -8 });
    expect(await expectInvariant(u.id)).toBe(-8);
  });

  it("rejects non-integer amounts and unknown users", async () => {
    const u = await createTestUser();
    await expect(applyCredit({ userId: u.id, delta: 1.5, reason: "purchase", idempotencyKey: "x" })).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(grantCredits(u.id, -1, "purchase", "y")).rejects.toMatchObject({ code: "validation_error" });
    await expect(grantCredits("usr_missing", 1, "purchase", "z")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("idempotency", () => {
  it("replaying a key is a no-op that returns the current balance", async () => {
    const u = await createTestUser();
    expect(await grantCredits(u.id, 10, "purchase", "stripe:evt_1")).toEqual({ applied: true, balance: 10 });
    await debitForJob({ userId: u.id, jobId: "job_a", amount: 3 });
    expect(await grantCredits(u.id, 10, "purchase", "stripe:evt_1")).toEqual({ applied: false, balance: 7 });
    expect(await debitForJob({ userId: u.id, jobId: "job_a", amount: 3 })).toEqual({ balance: 7 });
    expect(await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id))).toHaveLength(2);
    await expectInvariant(u.id);
  });

  it("refuses to reuse another account's idempotency key", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await grantCredits(a.id, 5, "purchase", "shared-key");
    await expect(grantCredits(b.id, 5, "purchase", "shared-key")).rejects.toMatchObject({ code: "conflict" });
    expect(await getBalance(b.id)).toBe(0);
  });
});

describe("concurrency", () => {
  it("20 parallel debits never take the balance negative", async () => {
    const u = await newUserWith(10);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => debitForJob({ userId: u.id, jobId: `job_p${i}`, amount: 1 })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(10);
    expect(failed).toHaveLength(10);
    for (const f of failed) expect(f.reason).toMatchObject({ code: "insufficient_credits" });
    expect(await getBalance(u.id)).toBe(0);
    expect(await expectInvariant(u.id)).toBe(0);

    const balances = (await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id))).map((e) => e.balanceAfter);
    expect(Math.min(...balances)).toBe(0);
  });
});

describe("outer transactions", () => {
  it("debits inside the caller's transaction and rolls back with it", async () => {
    const u = await newUserWith(10);
    await db.transaction(async (tx) => {
      await tx.insert(jobs).values({ id: "job_tx", userId: u.id, type: "upscale", input: { type: "upscale", sourceMediaId: "med_1", scale: 2, faceRestore: true }, creditsCharged: 2 });
      expect(await debitForJob({ userId: u.id, jobId: "job_tx", amount: 2 }, tx)).toEqual({ balance: 8 });
    });
    expect(await getBalance(u.id)).toBe(8);

    await expect(
      db.transaction(async (tx) => {
        await debitForJob({ userId: u.id, jobId: "job_rollback", amount: 3 }, tx);
        throw new Error("job insert failed");
      }),
    ).rejects.toThrow("job insert failed");
    expect(await getBalance(u.id)).toBe(8);
    expect(await db.select().from(creditLedger).where(eq(creditLedger.jobId, "job_rollback"))).toHaveLength(0);
    await expectInvariant(u.id);
  });

  it("an insufficient debit aborts the outer transaction", async () => {
    const u = await newUserWith(1);
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(jobs).values({ id: "job_poor", userId: u.id, type: "upscale", input: { type: "upscale", sourceMediaId: "med_1", scale: 2, faceRestore: true } });
        await debitForJob({ userId: u.id, jobId: "job_poor", amount: 2 }, tx);
      }),
    ).rejects.toMatchObject({ code: "insufficient_credits" });
    expect(await db.select().from(jobs).where(eq(jobs.id, "job_poor"))).toHaveLength(0);
  });
});

describe("refundJob", () => {
  async function chargedJob(charge: number) {
    const u = await newUserWith(20);
    const job = await createTestJob(u.id, { creditsCharged: charge });
    await debitForJob({ userId: u.id, jobId: job.id, amount: charge });
    return { u, job };
  }

  it("refunds everything still refundable by default and records it on the job", async () => {
    const { u, job } = await chargedJob(8);
    expect(await refundJob(job.id, { note: "provider failed" })).toEqual({ refunded: 8 });
    expect(await getBalance(u.id)).toBe(20);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.creditsRefunded).toBe(8);
    const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, `job:${job.id}:refund:full`));
    expect(entry).toMatchObject({ delta: 8, reason: "job_refund", jobId: job.id, note: "provider failed" });
    await expectInvariant(u.id);
  });

  it("caps partial refunds at creditsCharged - creditsRefunded and is idempotent per tag", async () => {
    const { u, job } = await chargedJob(8);
    expect(await refundJob(job.id, { amount: 3, tag: "blocked:1" })).toEqual({ refunded: 3 });
    expect(await refundJob(job.id, { amount: 3, tag: "blocked:1" })).toEqual({ refunded: 0 });
    expect(await refundJob(job.id, { amount: 100, tag: "blocked:2" })).toEqual({ refunded: 5 });
    expect(await refundJob(job.id, { tag: "full" })).toEqual({ refunded: 0 });
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.creditsRefunded).toBe(8);
    expect(await getBalance(u.id)).toBe(20);
    await expectInvariant(u.id);
  });

  it("parallel refunds with different tags never exceed the charge", async () => {
    const { u, job } = await chargedJob(6);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => refundJob(job.id, { amount: 2, tag: `t${i}` })));
    expect(results.reduce((s, r) => s + r.refunded, 0)).toBe(6);
    expect(await getBalance(u.id)).toBe(20);
  });

  it("throws not_found for unknown jobs", async () => {
    await expect(refundJob("job_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("adminAdjust", () => {
  it("records the admin and note, and cannot overdraw", async () => {
    const admin = await createTestUser({ role: "admin" });
    const u = await createTestUser();
    expect(await adminAdjust(admin.id, u.id, 15, "  goodwill  ")).toEqual({ applied: true, balance: 15 });
    expect(await adminAdjust(admin.id, u.id, -5, "correction")).toEqual({ applied: true, balance: 10 });
    await expect(adminAdjust(admin.id, u.id, -11, "too much")).rejects.toMatchObject({ code: "insufficient_credits" });
    await expect(adminAdjust(admin.id, u.id, 5, "   ")).rejects.toMatchObject({ code: "validation_error" });
    const entries = await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id));
    expect(entries.every((e) => e.reason === "admin_adjust" && e.createdBy === admin.id)).toBe(true);
    expect(entries.map((e) => e.note).sort()).toEqual(["correction", "goodwill"]);
    await expectInvariant(u.id);
  });

  it("is idempotent when given a key", async () => {
    const admin = await createTestUser({ role: "admin" });
    const u = await createTestUser();
    await adminAdjust(admin.id, u.id, 5, "bonus", "req_1");
    expect(await adminAdjust(admin.id, u.id, 5, "bonus", "req_1")).toEqual({ applied: false, balance: 5 });
  });
});

describe("listLedger", () => {
  it("pages newest first with a cursor and scopes to the user", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    await grantCredits(other.id, 99, "purchase", "other:1");
    for (let i = 1; i <= 7; i++) await grantCredits(u.id, i, "purchase", `p:${i}`);

    const first = await listLedger(u.id, { limit: 3 });
    expect(first.entries.map((e) => e.delta)).toEqual([7, 6, 5]);
    expect(first.entries[0]).toMatchObject({ balanceAfter: 28, reason: "purchase", jobId: null, note: null });
    expect(typeof first.entries[0]!.createdAt).toBe("string");
    expect(first.nextCursor).toBe(first.entries[2]!.id);

    const second = await listLedger(u.id, { limit: 3, cursor: first.nextCursor! });
    expect(second.entries.map((e) => e.delta)).toEqual([4, 3, 2]);
    const third = await listLedger(u.id, { limit: 3, cursor: second.nextCursor! });
    expect(third.entries.map((e) => e.delta)).toEqual([1]);
    expect(third.nextCursor).toBeNull();
  });

  it("orders entries written in one transaction and ignores foreign cursors", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    await grantCredits(other.id, 1, "purchase", "other:1");
    const [foreign] = await db.select().from(creditLedger).where(eq(creditLedger.userId, other.id));
    await db.transaction(async (tx) => {
      for (let i = 1; i <= 3; i++) await applyCredit({ userId: u.id, delta: i, reason: "purchase", idempotencyKey: `tx:${i}` }, tx);
    });
    expect((await listLedger(u.id)).entries.map((e) => e.balanceAfter)).toEqual([6, 3, 1]);
    expect((await listLedger(u.id, { cursor: foreign!.id })).entries).toEqual([]);
  });

  it("clamps the page size to at least one entry", async () => {
    const u = await createTestUser();
    await grantCredits(u.id, 1, "purchase", "c:1");
    await grantCredits(u.id, 2, "purchase", "c:2");
    const page = await listLedger(u.id, { limit: 0 });
    expect(page.entries.map((e) => e.delta)).toEqual([2]);
    expect(page.nextCursor).toBe(page.entries[0]!.id);
  });
});
