/**
 * Admin dashboard statistics: users, subscriptions/MRR, revenue, jobs, credits, provider cost
 * and an estimated gross margin for the last `days` days (UTC day buckets).
 *
 * Money is in integer cents, provider cost in USD (jobs.costUsd is an estimate per job).
 */
import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, jobs, moderationEvents, payments, reports, subscriptions, user } from "@/db/schema";
import { getPlan } from "@/config/plans";
import {
  JOB_STATUSES,
  JOB_TYPES,
  type CreditReason,
  type JobStatus,
  type JobType,
  type PlanId,
} from "@/types/domain";
import { dayKeys, num, periodStart, utcDay } from "./util";

/* ───────────────────────────── types ───────────────────────────── */

export interface PlanSubscriptionStats {
  planId: PlanId;
  monthly: number;
  yearly: number;
  /** Monthly recurring revenue from this plan, in cents (yearly prices / 12). */
  mrrCents: number;
}

export interface DailyRevenue {
  date: string;
  grossCents: number;
  refundsCents: number;
  netCents: number;
}

export interface JobTypeStats {
  type: JobType;
  total: number;
  failed: number;
  /** Jobs that reached a provider (only those incur provider cost). */
  submitted: number;
  costUsd: number;
  avgCostUsd: number;
  creditsCharged: number;
  creditsRefunded: number;
}

export interface DailyJobs {
  date: string;
  total: number;
  failed: number;
}

export interface AdminStats {
  period: { days: number; from: string; to: string };
  users: { total: number; new: number; suspended: number };
  subscriptions: { active: number; mrrCents: number; byPlan: PlanSubscriptionStats[] };
  revenue: { grossCents: number; refundsCents: number; netCents: number; payments: number; daily: DailyRevenue[] };
  jobs: {
    total: number;
    byStatus: Record<JobStatus, number>;
    /** failed / (succeeded + failed); null when nothing finished yet. */
    failureRate: number | null;
    byType: JobTypeStats[];
    daily: DailyJobs[];
  };
  credits: {
    /** Credits handed out (signup bonus, purchases, plan grants, positive admin adjustments). */
    granted: number;
    /** Credits removed by admins (negative adjustments). */
    adminRemoved: number;
    debited: number;
    refunded: number;
    /** Net credits spent on jobs (debited − refunded). */
    consumed: number;
  };
  providerCost: { totalUsd: number; avgPerJobUsd: number; submittedJobs: number };
  /** Net revenue minus estimated provider cost. */
  margin: { grossMarginCents: number; marginRate: number | null };
  moderation: { openReports: number; unreviewedEvents: number };
}

/* ───────────────────────────── pure helpers (unit tested) ───────────────────────────── */

/** Revenue-relevant payment aggregate: amounts split by sign, per status (and optionally per day). */
export interface PaymentAggregate {
  status: "paid" | "refunded" | "failed";
  /** Sum of positive amounts in cents. */
  positiveCents: number;
  /** Sum of |negative amounts| in cents. */
  negativeCents: number;
}

/**
 * Gross / refunds / net for a set of payment aggregates.
 *
 * Convention: `paid` rows are money received. A `refunded` row with a positive amount is a payment
 * that was later refunded in full (it counts as gross AND as a refund); a negative amount on any
 * row is a refund record (partial refunds). `failed` rows never count.
 */
export function revenueFromPayments(rows: readonly PaymentAggregate[]): {
  grossCents: number;
  refundsCents: number;
  netCents: number;
} {
  let grossCents = 0;
  let refundsCents = 0;
  for (const row of rows) {
    if (row.status === "failed") continue;
    grossCents += row.positiveCents;
    refundsCents += row.negativeCents;
    if (row.status === "refunded") refundsCents += row.positiveCents;
  }
  return { grossCents, refundsCents, netCents: grossCents - refundsCents };
}

/** Monthly recurring revenue in cents for one subscription (yearly plans count 1/12 of the yearly price). */
export function monthlyPriceCents(planId: PlanId, interval: "month" | "year"): number {
  const plan = getPlan(planId);
  return interval === "year" ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
}

/** Active subscription counts (by plan + interval) → per-plan stats and total MRR. */
export function mrrByPlan(rows: readonly { planId: PlanId; interval: "month" | "year"; count: number }[]): {
  mrrCents: number;
  active: number;
  byPlan: PlanSubscriptionStats[];
} {
  const plans = new Map<PlanId, PlanSubscriptionStats>();
  for (const row of rows) {
    const entry = plans.get(row.planId) ?? { planId: row.planId, monthly: 0, yearly: 0, mrrCents: 0 };
    if (row.interval === "year") entry.yearly += row.count;
    else entry.monthly += row.count;
    entry.mrrCents += row.count * monthlyPriceCents(row.planId, row.interval);
    plans.set(row.planId, entry);
  }
  const byPlan = [...plans.values()].sort((a, b) => b.mrrCents - a.mrrCents || a.planId.localeCompare(b.planId));
  return {
    byPlan,
    mrrCents: byPlan.reduce((sum, p) => sum + p.mrrCents, 0),
    active: byPlan.reduce((sum, p) => sum + p.monthly + p.yearly, 0),
  };
}

const GRANT_REASONS: ReadonlySet<CreditReason> = new Set<CreditReason>([
  "signup_bonus",
  "purchase",
  "subscription_grant",
  "admin_adjust",
]);

/** Credit flows from ledger sums per reason (positive and |negative| parts). */
export function creditFlows(
  rows: readonly { reason: CreditReason; positive: number; negative: number }[],
): AdminStats["credits"] {
  let granted = 0;
  let adminRemoved = 0;
  let debited = 0;
  let refunded = 0;
  for (const row of rows) {
    if (GRANT_REASONS.has(row.reason)) granted += row.positive;
    if (row.reason === "admin_adjust") adminRemoved += row.negative;
    if (row.reason === "job_debit") debited += row.negative - row.positive;
    if (row.reason === "job_refund") refunded += row.positive - row.negative;
  }
  return { granted, adminRemoved, debited, refunded, consumed: debited - refunded };
}

/** Round a USD amount to 1/100 of a cent (avoids float noise like 0.30000000000000004). */
export function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/* ───────────────────────────── queries ───────────────────────────── */

async function userStats(from: Date): Promise<AdminStats["users"]> {
  const [row] = await db
    .select({
      total: count(),
      new: sql<number>`count(*) filter (where ${user.createdAt} >= ${from.toISOString()}::timestamptz)`,
      suspended: sql<number>`count(*) filter (where ${user.banned} is true)`,
    })
    .from(user)
    .where(isNull(user.deletedAt));
  return { total: num(row?.total), new: num(row?.new), suspended: num(row?.suspended) };
}

async function subscriptionStats(): Promise<AdminStats["subscriptions"]> {
  const rows = await db
    .select({ planId: subscriptions.planId, interval: subscriptions.interval, count: count() })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"))
    .groupBy(subscriptions.planId, subscriptions.interval);
  return mrrByPlan(rows.map((r) => ({ ...r, count: num(r.count) })));
}

async function revenueStats(from: Date, days: string[]): Promise<AdminStats["revenue"]> {
  const day = utcDay(payments.createdAt);
  const rows = await db
    .select({
      day,
      status: payments.status,
      positiveCents: sql<number>`coalesce(sum(case when ${payments.amountCents} > 0 then ${payments.amountCents} else 0 end), 0)`,
      negativeCents: sql<number>`coalesce(sum(case when ${payments.amountCents} < 0 then -${payments.amountCents} else 0 end), 0)`,
      payments: sql<number>`count(*) filter (where ${payments.amountCents} > 0)`,
    })
    .from(payments)
    .where(and(gte(payments.createdAt, from), inArray(payments.status, ["paid", "refunded"])))
    .groupBy(day, payments.status);

  const parsed = rows.map((r) => ({
    day: r.day,
    status: r.status,
    positiveCents: num(r.positiveCents),
    negativeCents: num(r.negativeCents),
    payments: num(r.payments),
  }));
  const byDay = new Map<string, PaymentAggregate[]>();
  for (const row of parsed) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);

  return {
    ...revenueFromPayments(parsed),
    payments: parsed.reduce((sum, r) => sum + r.payments, 0),
    daily: days.map((date) => ({ date, ...revenueFromPayments(byDay.get(date) ?? []) })),
  };
}

async function jobStats(from: Date, days: string[]): Promise<{ jobs: AdminStats["jobs"]; cost: AdminStats["providerCost"] }> {
  const submitted = sql`${jobs.submittedAt} is not null`;
  const grouped = await db
    .select({
      type: jobs.type,
      status: jobs.status,
      total: count(),
      submitted: sql<number>`count(*) filter (where ${submitted})`,
      // costUsd is float4: sum it as numeric so totals don't drift.
      costUsd: sql<number>`coalesce(sum(${jobs.costUsd}::numeric) filter (where ${submitted}), 0)`,
      creditsCharged: sql<number>`coalesce(sum(${jobs.creditsCharged}), 0)`,
      creditsRefunded: sql<number>`coalesce(sum(${jobs.creditsRefunded}), 0)`,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, from))
    .groupBy(jobs.type, jobs.status);

  const day = utcDay(jobs.createdAt);
  const dailyRows = await db
    .select({ day, total: count(), failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')` })
    .from(jobs)
    .where(gte(jobs.createdAt, from))
    .groupBy(day);

  const byStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  const byType = new Map<JobType, JobTypeStats>();
  for (const row of grouped) {
    const total = num(row.total);
    byStatus[row.status] += total;
    const entry = byType.get(row.type) ?? {
      type: row.type,
      total: 0,
      failed: 0,
      submitted: 0,
      costUsd: 0,
      avgCostUsd: 0,
      creditsCharged: 0,
      creditsRefunded: 0,
    };
    entry.total += total;
    if (row.status === "failed") entry.failed += total;
    entry.submitted += num(row.submitted);
    entry.costUsd += num(row.costUsd);
    entry.creditsCharged += num(row.creditsCharged);
    entry.creditsRefunded += num(row.creditsRefunded);
    byType.set(row.type, entry);
  }
  const types = JOB_TYPES.flatMap((t) => {
    const entry = byType.get(t);
    if (!entry) return [];
    entry.costUsd = roundUsd(entry.costUsd);
    entry.avgCostUsd = entry.submitted ? roundUsd(entry.costUsd / entry.submitted) : 0;
    return [entry];
  }).sort((a, b) => b.costUsd - a.costUsd || b.total - a.total);

  const total = types.reduce((sum, t) => sum + t.total, 0);
  const finished = byStatus.succeeded + byStatus.failed;
  const totalUsd = roundUsd(types.reduce((sum, t) => sum + t.costUsd, 0));
  const submittedJobs = types.reduce((sum, t) => sum + t.submitted, 0);
  const daily = new Map(dailyRows.map((r) => [r.day, { total: num(r.total), failed: num(r.failed) }]));

  return {
    jobs: {
      total,
      byStatus,
      failureRate: finished ? byStatus.failed / finished : null,
      byType: types,
      daily: days.map((date) => ({ date, ...(daily.get(date) ?? { total: 0, failed: 0 }) })),
    },
    cost: { totalUsd, submittedJobs, avgPerJobUsd: submittedJobs ? roundUsd(totalUsd / submittedJobs) : 0 },
  };
}

async function creditStats(from: Date): Promise<AdminStats["credits"]> {
  const rows = await db
    .select({
      reason: creditLedger.reason,
      positive: sql<number>`coalesce(sum(case when ${creditLedger.delta} > 0 then ${creditLedger.delta} else 0 end), 0)`,
      negative: sql<number>`coalesce(sum(case when ${creditLedger.delta} < 0 then -${creditLedger.delta} else 0 end), 0)`,
    })
    .from(creditLedger)
    .where(gte(creditLedger.createdAt, from))
    .groupBy(creditLedger.reason);
  return creditFlows(rows.map((r) => ({ reason: r.reason, positive: num(r.positive), negative: num(r.negative) })));
}

async function moderationStats(): Promise<AdminStats["moderation"]> {
  const [[openReports], [unreviewed]] = await Promise.all([
    db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ n: count() }).from(moderationEvents).where(eq(moderationEvents.reviewed, false)),
  ]);
  return { openReports: num(openReports?.n), unreviewedEvents: num(unreviewed?.n) };
}

/** Dashboard statistics for the last `days` UTC days (including today). */
export async function getStats(opts: { days?: number; now?: Date } = {}): Promise<AdminStats> {
  const days = Math.min(Math.max(Math.trunc(opts.days ?? 30), 1), 365);
  const now = opts.now ?? new Date();
  const from = periodStart(days, now);
  const keys = dayKeys(from, now);

  const [users, subs, revenue, jobResult, credits, moderation] = await Promise.all([
    userStats(from),
    subscriptionStats(),
    revenueStats(from, keys),
    jobStats(from, keys),
    creditStats(from),
    moderationStats(),
  ]);

  const grossMarginCents = revenue.netCents - Math.round(jobResult.cost.totalUsd * 100);
  return {
    period: { days, from: from.toISOString(), to: now.toISOString() },
    users,
    subscriptions: subs,
    revenue,
    jobs: jobResult.jobs,
    credits,
    providerCost: jobResult.cost,
    margin: { grossMarginCents, marginRate: revenue.netCents > 0 ? grossMarginCents / revenue.netCents : null },
    moderation,
  };
}
