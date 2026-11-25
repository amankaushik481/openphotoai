/**
 * Property-style ledger test: random sequences of everything that moves credits (paid / free / failing /
 * blocked / stuck jobs, batches, syncs, cancels, timeouts, admin refunds and adjustments, team
 * transfers, credit-pack purchases, partial / full refunds, disputes won and lost) must keep, after
 * every single step:
 *   - user.credits == SUM(credit_ledger.delta) and == the newest entry's balanceAfter;
 *   - per job: 0 <= creditsRefunded <= creditsCharged, and SUM(ledger of the job) == refunded - charged;
 *   - a job that ended without succeeding has been refunded in full (exactly once);
 *   - a balance is negative only after a purchase reversal.
 * Deterministic: a seeded PRNG drives every choice, so a failure names a reproducible seed + step.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { creditLedger, jobs, teamMembers, teams, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { buildMockEvent } from "@/providers/payment/mock";
import { setProviderOverrides } from "@/providers/registry";
import { applyPaymentEvent } from "@/server/billing/events";
import { adminAdjust, grantCredits, refundJob } from "@/server/credits/ledger";
import { AppError } from "@/server/http";
import { cancelJob, createBatch, createJob, failJob, syncJob } from "@/server/jobs/engine";
import { transferCredits } from "@/server/teams/credits";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { resetSafety, safetyState, useTempStorage } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);
vi.mock("@/server/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "eml_x", status: "mocked" })),
  sendEmailSafe: vi.fn(async () => ({ id: "eml_x", status: "mocked" })),
}));

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
});

/** mulberry32 */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Errors a random operation is allowed to hit (the operation is then simply refused). */
const EXPECTED = new Set(["insufficient_credits", "rate_limited", "plan_limit", "validation_error", "conflict", "not_found", "content_blocked", "provider_error"]);

async function assertInvariants(where: string): Promise<void> {
  const users = await db
    .select({
      id: userTable.id,
      credits: userTable.credits,
      sum: sql<number>`(select coalesce(sum(l.delta), 0)::int from credit_ledger l where l.user_id = "user"."id")`,
      last: sql<number | null>`(select l.balance_after from credit_ledger l where l.user_id = "user"."id" order by l.created_at desc, l.id desc limit 1)`,
      reversals: sql<number>`(select count(*)::int from credit_ledger l where l.user_id = "user"."id" and l.reason = 'purchase_reversal')`,
    })
    .from(userTable);
  for (const u of users) {
    expect(Number(u.sum), `${where}: ledger sum of ${u.id}`).toBe(u.credits);
    if (u.last !== null) expect(Number(u.last), `${where}: balanceAfter of ${u.id}`).toBe(u.credits);
    if (u.credits < 0) expect(Number(u.reversals), `${where}: negative balance of ${u.id} without a reversal`).toBeGreaterThan(0);
  }
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      charged: jobs.creditsCharged,
      refunded: jobs.creditsRefunded,
      sum: sql<number>`(select coalesce(sum(l.delta), 0)::int from credit_ledger l where l.job_id = "jobs"."id")`,
    })
    .from(jobs);
  for (const j of rows) {
    expect(j.refunded, `${where}: job ${j.id} refunded`).toBeGreaterThanOrEqual(0);
    expect(j.refunded, `${where}: job ${j.id} over-refunded`).toBeLessThanOrEqual(j.charged);
    expect(Number(j.sum), `${where}: ledger of job ${j.id} (${j.status})`).toBe(j.refunded - j.charged);
    if (j.status === "failed" || j.status === "canceled" || j.status === "blocked") {
      expect(j.refunded, `${where}: ${j.status} job ${j.id} not fully refunded`).toBe(j.charged);
    }
  }
}

async function scenario(seed: number, steps: number): Promise<void> {
  const rnd = prng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  const admin = await createTestUser({ role: "admin" });
  const people: UserRow[] = [];
  const models = new Map<string, string>();
  for (const [i, plan] of (["free", "pro", "studio"] as const).entries()) {
    const u = await createTestUser({ plan, hasPaid: plan !== "free" });
    await grantCredits(u.id, [5, 30, 120][i]!, "signup_bonus", `signup:${u.id}`);
    people.push(u);
    models.set(u.id, (await createTestModel(u.id)).id);
  }
  // Studio owner (people[2]) with an active member (people[1]).
  const [team] = await db.insert(teams).values({ ownerId: people[2]!.id, name: "Team" }).returning();
  await db.insert(teamMembers).values({ teamId: team!.id, userId: people[2]!.id, email: people[2]!.email, role: "owner", status: "active" });
  await db.insert(teamMembers).values({ teamId: team!.id, userId: people[1]!.id, email: people[1]!.email, role: "member", status: "active" });

  const payments: { userId: string; id: string; cents: number; disputes: number }[] = [];
  const reload = async (id: string) => (await db.select().from(userTable).where(eq(userTable.id, id)))[0]!;
  const jobIds = async () => (await db.select({ id: jobs.id, userId: jobs.userId }).from(jobs)).map((r) => r);

  for (let step = 0; step < steps; step++) {
    const who = await reload(pick(people).id);
    const op = pick([
      "job", "job", "job", "draft", "batch", "sync", "sync", "sync", "cancel", "timeout", "adminRefund",
      "adjust", "transfer", "buy", "refund", "dispute", "disputeClosed",
    ] as const);
    const label = `seed ${seed} step ${step} (${op})`;
    try {
      switch (op) {
        case "job":
        case "draft": {
          const marker = pick(["", "", "", " [mock:fail]", " [mock:nsfw-output]", " [mock:stuck]"]);
          const input = {
            type: "generate",
            modelId: models.get(who.id)!,
            prompt: `portrait of {subject}${marker}`,
            numImages: int(1, 4),
            quality: op === "draft" ? "draft" : pick(["standard", "standard", "high"]),
            aspectRatio: "4:5",
          } as JobInput;
          safetyState.likeness = Array.from({ length: 4 }, () => pick([null, 0.9, 0.9, 0.2]));
          await createJob(who, input, { skipRateLimit: true, idempotencyKey: rnd() < 0.2 ? `k${int(0, 5)}` : null });
          break;
        }
        case "batch":
          await createBatch(who, { modelId: models.get(who.id)!, packId: "linkedin-headshots", count: int(1, 4), quality: "standard" });
          break;
        case "sync": {
          const all = await jobIds();
          if (all.length) {
            safetyState.likeness = Array.from({ length: 4 }, () => pick([null, 0.9, 0.9, 0.2]));
            await syncJob(pick(all).id, { force: true });
          }
          break;
        }
        case "cancel": {
          const all = await jobIds();
          if (all.length) {
            const j = pick(all);
            await cancelJob(j.userId, j.id);
          }
          break;
        }
        case "timeout": {
          const all = await jobIds();
          if (all.length) await failJob(pick(all).id, "timed out", "timeout");
          break;
        }
        case "adminRefund": {
          const all = await jobIds();
          if (all.length) await refundJob(pick(all).id, { amount: int(0, 6), tag: pick(["admin", "admin2"]), createdBy: admin.id });
          break;
        }
        case "adjust":
          await adminAdjust(admin.id, who.id, pick([-20, -3, 4, 25]), "test", rnd() < 0.3 ? `adj-${int(0, 3)}` : undefined);
          break;
        case "transfer":
          await transferCredits(await reload(people[2]!.id), team!.id, people[1]!.id, int(1, 40), {
            idempotencyKey: rnd() < 0.3 ? `t${int(0, 3)}` : null,
          });
          break;
        case "buy": {
          const id = `cs_${seed}_${step}`;
          await applyPaymentEvent(
            "mock",
            buildMockEvent("checkout.completed", {
              userId: who.id,
              customerId: null,
              mode: "payment",
              checkoutId: id,
              creditPackId: "credits_100",
              amountCents: 900,
              currency: "usd",
            }),
          );
          payments.push({ userId: who.id, id, cents: 900, disputes: 0 });
          break;
        }
        case "refund": {
          if (!payments.length) break;
          const p = pick(payments);
          const full = rnd() < 0.5;
          await applyPaymentEvent(
            "mock",
            buildMockEvent("payment.refunded", { paymentId: p.id, amountRefundedCents: full ? p.cents : int(1, p.cents - 1), fullyRefunded: full }),
          );
          break;
        }
        case "dispute": {
          if (!payments.length) break;
          const p = pick(payments);
          p.disputes++;
          await applyPaymentEvent(
            "mock",
            buildMockEvent("payment.disputed", { paymentId: p.id, disputeId: `dp_${p.id}_${p.disputes}`, amountCents: p.cents }),
          );
          break;
        }
        case "disputeClosed": {
          const disputed = payments.filter((p) => p.disputes > 0);
          if (!disputed.length) break;
          const p = pick(disputed);
          const won = rnd() < 0.5;
          await applyPaymentEvent(
            "mock",
            buildMockEvent("payment.dispute_closed", { paymentId: p.id, disputeId: `dp_${p.id}_${p.disputes}`, won, status: won ? "won" : "lost" }),
          );
          break;
        }
      }
    } catch (err) {
      if (!(err instanceof AppError && EXPECTED.has(err.code))) throw new Error(`${label} threw: ${String(err)}`, { cause: err });
    }
    await assertInvariants(label);
  }
  // Finally drain everything that can still finish, then re-check.
  for (const j of await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "running"))) {
    await syncJob(j.id, { force: true });
  }
  await assertInvariants(`seed ${seed} end`);
  for (const r of await db.selectDistinct({ reason: creditLedger.reason }).from(creditLedger)) seenReasons.add(r.reason);
  for (const r of await db.selectDistinct({ status: jobs.status }).from(jobs)) seenStatuses.add(r.status);
}

const seenReasons = new Set<string>();
const seenStatuses = new Set<string>();

describe("credit ledger invariant under random operation sequences", () => {
  for (const seed of [1, 7, 42, 1337, 2026]) {
    it(`seed ${seed}`, async () => {
      await scenario(seed, 45);
    }, 120_000);
  }

  it("the sequences covered every kind of credit movement and job outcome", () => {
    for (const reason of ["signup_bonus", "job_debit", "job_refund", "purchase", "purchase_reversal", "transfer_out", "transfer_in", "admin_adjust"]) {
      expect(seenReasons, reason).toContain(reason);
    }
    for (const status of ["running", "succeeded", "failed", "canceled", "blocked"]) expect(seenStatuses, status).toContain(status);
  });
});
