import { beforeEach, describe, expect, it } from "vitest";
import { applyCredit } from "@/server/credits/ledger";
import { creditFlows, getStats, monthlyPriceCents, mrrByPlan, revenueFromPayments } from "@/server/admin";
import { createTestDb, createTestJob, createTestUser } from "../../helpers/factories";
import { createModerationEvent, createPayment, createReport, createSubscription } from "./fixtures";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(async () => {
  await createTestDb();
});

describe("pure stats helpers", () => {
  it("revenue = paid + refunded originals − refunds (fully refunded rows and negative refund rows)", () => {
    expect(
      revenueFromPayments([
        { status: "paid", positiveCents: 5000, negativeCents: 0 },
        { status: "refunded", positiveCents: 1500, negativeCents: 300 },
        { status: "failed", positiveCents: 9900, negativeCents: 0 },
      ]),
    ).toEqual({ grossCents: 6500, refundsCents: 1800, netCents: 4700 });
  });

  it("MRR counts yearly subscriptions at 1/12 of the yearly price", () => {
    expect(monthlyPriceCents("pro", "month")).toBe(3900);
    expect(monthlyPriceCents("pro", "year")).toBe(3250); // 39000 / 12
    expect(monthlyPriceCents("studio", "year")).toBe(8250); // 99000 / 12
    const result = mrrByPlan([
      { planId: "starter", interval: "month", count: 2 },
      { planId: "starter", interval: "year", count: 1 },
      { planId: "studio", interval: "year", count: 1 },
    ]);
    expect(result.mrrCents).toBe(2 * 1500 + 1250 + 8250);
    expect(result.active).toBe(4);
    expect(result.byPlan[0]).toEqual({ planId: "studio", monthly: 0, yearly: 1, mrrCents: 8250 });
    expect(result.byPlan[1]).toEqual({ planId: "starter", monthly: 2, yearly: 1, mrrCents: 4250 });
  });

  it("credit flows separate grants, admin removals and net job consumption", () => {
    expect(
      creditFlows([
        { reason: "purchase", positive: 500, negative: 0 },
        { reason: "signup_bonus", positive: 10, negative: 0 },
        { reason: "admin_adjust", positive: 20, negative: 5 },
        { reason: "job_debit", positive: 0, negative: 40 },
        { reason: "job_refund", positive: 12, negative: 0 },
        { reason: "transfer_in", positive: 50, negative: 0 },
      ]),
    ).toEqual({ granted: 530, adminRemoved: 5, debited: 40, refunded: 12, consumed: 28 });
  });
});

describe("getStats on seeded data", () => {
  it("computes users, MRR, revenue minus refunds, job failure rate, provider cost per job and margin", async () => {
    const admin = await createTestUser({ role: "admin" });
    const u1 = await createTestUser();
    const u2 = await createTestUser({ banned: true, banReason: "spam" });
    const old = await createTestUser({ createdAt: ago(40) });
    await createTestUser({ deletedAt: new Date() }); // excluded from totals

    // Subscriptions: pro monthly 3900 + starter yearly 15000/12 + pro yearly 39000/12; canceled ignored.
    await createSubscription(u1.id, { planId: "pro", interval: "month" });
    await createSubscription(u2.id, { planId: "starter", interval: "year" });
    await createSubscription(admin.id, { planId: "pro", interval: "year" });
    await createSubscription(old.id, { planId: "studio", interval: "year", status: "canceled" });

    // Payments (7-day window).
    await createPayment(u1.id, { amountCents: 3900, kind: "subscription", productId: "pro_month" });
    await createPayment(u1.id, { amountCents: -500, status: "refunded" }); // partial refund record, today
    await createPayment(u2.id, { amountCents: 3900, status: "refunded", createdAt: ago(1) }); // fully refunded
    await createPayment(u2.id, { amountCents: 900, createdAt: ago(2) });
    await createPayment(u2.id, { amountCents: 9900, status: "failed" }); // never counts
    await createPayment(old.id, { amountCents: 9900, createdAt: ago(20) }); // outside the window

    // Jobs: only submitted jobs carry provider cost.
    const submittedAt = new Date();
    const j1 = await createTestJob(u1.id, { status: "succeeded", costUsd: 0.035, creditsCharged: 4, submittedAt });
    const j2 = await createTestJob(u1.id, { status: "failed", costUsd: 0.035, creditsCharged: 4, creditsRefunded: 4, submittedAt, error: "boom" });
    await createTestJob(u2.id, {
      type: "video",
      input: { type: "video", sourceMediaId: "med_x", durationSec: 5 },
      status: "succeeded",
      costUsd: 0.42,
      creditsCharged: 10,
      submittedAt,
    });
    await createTestJob(u2.id, {
      type: "upscale",
      input: { type: "upscale", sourceMediaId: "med_x", scale: 2, faceRestore: true },
      status: "queued",
      costUsd: 0.064,
      creditsCharged: 2,
    });
    await createTestJob(old.id, { status: "failed", costUsd: 2, submittedAt: ago(30), createdAt: ago(30) });

    // Ledger.
    await applyCredit({ userId: u1.id, delta: 100, reason: "purchase", idempotencyKey: "p1" });
    await applyCredit({ userId: u2.id, delta: 10, reason: "signup_bonus", idempotencyKey: "s1" });
    await applyCredit({ userId: u1.id, delta: 20, reason: "admin_adjust", idempotencyKey: "a1", createdBy: admin.id });
    await applyCredit({ userId: u1.id, delta: -5, reason: "admin_adjust", idempotencyKey: "a2", createdBy: admin.id });
    await applyCredit({ userId: u1.id, delta: -4, reason: "job_debit", jobId: j1.id, idempotencyKey: "d1" });
    await applyCredit({ userId: u1.id, delta: -4, reason: "job_debit", jobId: j2.id, idempotencyKey: "d2" });
    await applyCredit({ userId: u1.id, delta: 4, reason: "job_refund", jobId: j2.id, idempotencyKey: "r2" });

    // Moderation.
    await createReport({ targetUserId: u2.id });
    await createReport({ targetUserId: u2.id, status: "actioned" });
    await createModerationEvent({ userId: u2.id });
    await createModerationEvent({ userId: u2.id, kind: "output_blocked" });
    await createModerationEvent({ userId: u2.id, reviewed: true });

    const now = new Date();
    const stats = await getStats({ days: 7, now });

    expect(stats.period.days).toBe(7);
    expect(stats.users).toEqual({ total: 4, new: 3, suspended: 1 });

    expect(stats.subscriptions.mrrCents).toBe(3900 + 1250 + 3250);
    expect(stats.subscriptions.active).toBe(3);
    expect(stats.subscriptions.byPlan).toEqual([
      { planId: "pro", monthly: 1, yearly: 1, mrrCents: 7150 },
      { planId: "starter", monthly: 0, yearly: 1, mrrCents: 1250 },
    ]);

    expect(stats.revenue.grossCents).toBe(3900 + 3900 + 900);
    expect(stats.revenue.refundsCents).toBe(500 + 3900);
    expect(stats.revenue.netCents).toBe(4300);
    expect(stats.revenue.payments).toBe(3);
    expect(stats.revenue.daily).toHaveLength(7);
    const daily = Object.fromEntries(stats.revenue.daily.map((d) => [d.date, d]));
    expect(daily[dayKey(now)]).toMatchObject({ grossCents: 3900, refundsCents: 500, netCents: 3400 });
    expect(daily[dayKey(ago(1))]).toMatchObject({ grossCents: 3900, refundsCents: 3900, netCents: 0 });
    expect(daily[dayKey(ago(2))]).toMatchObject({ grossCents: 900, refundsCents: 0, netCents: 900 });

    expect(stats.jobs.total).toBe(4);
    expect(stats.jobs.byStatus).toMatchObject({ succeeded: 2, failed: 1, queued: 1, running: 0 });
    expect(stats.jobs.failureRate).toBeCloseTo(1 / 3);
    const generate = stats.jobs.byType.find((t) => t.type === "generate");
    expect(generate).toMatchObject({ total: 2, failed: 1, submitted: 2, costUsd: 0.07, avgCostUsd: 0.035, creditsCharged: 8, creditsRefunded: 4 });
    const upscale = stats.jobs.byType.find((t) => t.type === "upscale");
    expect(upscale).toMatchObject({ total: 1, submitted: 0, costUsd: 0, avgCostUsd: 0 });
    expect(stats.jobs.byType[0]!.type).toBe("video"); // most expensive first
    expect(stats.jobs.daily.find((d) => d.date === dayKey(now))).toEqual({ date: dayKey(now), total: 4, failed: 1 });

    expect(stats.providerCost).toEqual({ totalUsd: 0.49, submittedJobs: 3, avgPerJobUsd: 0.1633 });
    expect(stats.margin.grossMarginCents).toBe(4300 - 49);
    expect(stats.margin.marginRate).toBeCloseTo(4251 / 4300);

    expect(stats.credits).toEqual({ granted: 130, adminRemoved: 5, debited: 8, refunded: 4, consumed: 4 });
    expect(stats.moderation).toEqual({ openReports: 1, unreviewedEvents: 2 });
  });

  it("returns zeros (and null rates) on an empty database", async () => {
    const stats = await getStats({ days: 1 });
    expect(stats.revenue).toMatchObject({ grossCents: 0, refundsCents: 0, netCents: 0, payments: 0 });
    expect(stats.revenue.daily).toHaveLength(1);
    expect(stats.jobs.failureRate).toBeNull();
    expect(stats.margin).toEqual({ grossMarginCents: 0, marginRate: null });
    expect(stats.subscriptions).toEqual({ active: 0, mrrCents: 0, byPlan: [] });
  });
});
