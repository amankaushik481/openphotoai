import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { BarChart } from "@/components/admin/bar-chart";
import { formatCents, formatCostUsd, formatNumber, formatPercent } from "@/components/admin/format";
import { JobsTable } from "@/components/admin/jobs-table";
import { KpiCard, PeriodLinks, Section } from "@/components/admin/section";
import { getStats, listJobs } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Overview" };

const PERIODS = [7, 30, 90];

function parseDays(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return PERIODS.includes(n) ? n : 30;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const days = parseDays((await searchParams).days);
  const [stats, failures] = await Promise.all([getStats({ days }), listJobs({ status: "failed", limit: 8 })]);
  const { revenue, jobs, subscriptions, credits, providerCost, margin, moderation, users } = stats;
  const queueSize = moderation.openReports + moderation.unreviewedEvents;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description={`Last ${days} days (UTC). Revenue is net of refunds; provider cost is estimated per job.`}
        actions={<PeriodLinks pathname="/admin" days={days} options={PERIODS} />}
      />

      <h2 className="sr-only">Key figures</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Users" value={formatNumber(users.total)} hint={`+${formatNumber(users.new)} new · ${users.suspended} suspended`} href="/admin/users" />
        <KpiCard
          label="MRR"
          value={formatCents(subscriptions.mrrCents)}
          hint={`${formatNumber(subscriptions.active)} active subscription${subscriptions.active === 1 ? "" : "s"}`}
          href="/admin/revenue"
        />
        <KpiCard
          label="Net revenue"
          value={formatCents(revenue.netCents)}
          hint={`${formatCents(revenue.refundsCents)} refunded`}
          href="/admin/revenue"
        />
        <KpiCard
          label="Gross margin (est.)"
          value={formatCents(margin.grossMarginCents)}
          hint={`${formatPercent(margin.marginRate)} of net revenue`}
          tone={margin.grossMarginCents < 0 ? "destructive" : "default"}
        />
        <KpiCard
          label="Jobs"
          value={formatNumber(jobs.total)}
          hint={`${formatPercent(jobs.failureRate)} failure rate`}
          tone={jobs.failureRate !== null && jobs.failureRate > 0.1 ? "warning" : "default"}
          href="/admin/jobs"
        />
        <KpiCard
          label="Provider cost"
          value={formatCostUsd(providerCost.totalUsd)}
          hint={`${formatCostUsd(providerCost.avgPerJobUsd)} avg per job`}
        />
        <KpiCard
          label="Credits granted / used"
          value={`${formatNumber(credits.granted)} / ${formatNumber(credits.consumed)}`}
          hint={`${formatNumber(credits.refunded)} refunded on jobs`}
        />
        <KpiCard
          label="Moderation queue"
          value={formatNumber(queueSize)}
          hint={`${moderation.openReports} open report${moderation.openReports === 1 ? "" : "s"} · ${moderation.unreviewedEvents} safety event${moderation.unreviewedEvents === 1 ? "" : "s"}`}
          tone={moderation.openReports > 0 ? "warning" : "default"}
          href="/admin/moderation"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Revenue" description="Net revenue per day (payments minus refunds).">
          <BarChart
            id="overview-revenue"
            title="Daily net revenue"
            data={revenue.daily.map((d) => ({ date: d.date, value: d.netCents }))}
            format={formatCents}
            valueLabel="Net revenue"
          />
        </Section>
        <Section title="Jobs" description="Jobs created per day; failures in red.">
          <BarChart
            id="overview-jobs"
            title="Daily jobs"
            data={jobs.daily.map((d) => ({ date: d.date, value: d.total, part: d.failed }))}
            format={formatNumber}
            valueLabel="Jobs"
            partLabel="Failed"
          />
        </Section>
      </div>

      <Section
        className="mt-6"
        flush
        title="Recent failures"
        description="Newest failed jobs. Failed jobs are refunded automatically; refund the rest by hand if needed."
        action={
          <Link href="/admin/jobs?status=failed" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            All failures
          </Link>
        }
      >
        <JobsTable jobs={failures.jobs} empty="No failed jobs." />
      </Section>
    </>
  );
}
