import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge } from "@/components/admin/badges";
import { BarChart } from "@/components/admin/bar-chart";
import {
  formatCents,
  formatCostUsd,
  formatDate,
  formatDateTime,
  formatDayKey,
  formatNumber,
  formatPercent,
  humanize,
} from "@/components/admin/format";
import { EmptyRow, KpiCard, NextPageLink, PeriodLinks, Section } from "@/components/admin/section";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPlan } from "@/config/plans";
import { getStats, listPayments } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Revenue" };

const PERIODS = [7, 30, 90, 365];
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const raw = await searchParams;
  const requested = Number(first(raw.days));
  const days = PERIODS.includes(requested) ? requested : 30;
  const cursor = first(raw.cursor)?.slice(0, 64);

  const [stats, paymentPage] = await Promise.all([getStats({ days }), listPayments({ days, cursor })]);
  const { revenue, subscriptions, providerCost, margin, jobs } = stats;
  const daysWithActivity = revenue.daily.filter((d) => d.grossCents || d.refundsCents).reverse();

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Revenue"
        description={`Last ${days} days (UTC). Net revenue = payments − refunds; a fully refunded payment counts on its original day.`}
        actions={<PeriodLinks pathname="/admin/revenue" days={days} options={PERIODS} />}
      />

      <h2 className="sr-only">Summary</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Gross revenue" value={formatCents(revenue.grossCents)} hint={`${formatNumber(revenue.payments)} payments`} />
        <KpiCard label="Refunds" value={formatCents(revenue.refundsCents)} tone={revenue.refundsCents > 0 ? "warning" : "default"} />
        <KpiCard label="Net revenue" value={formatCents(revenue.netCents)} />
        <KpiCard label="MRR" value={formatCents(subscriptions.mrrCents)} hint={`ARR ${formatCents(subscriptions.mrrCents * 12)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Daily net revenue">
          <BarChart
            id="revenue-daily"
            title="Net revenue per day"
            data={revenue.daily.map((d) => ({ date: d.date, value: d.netCents }))}
            format={formatCents}
            valueLabel="Net revenue"
          />
        </Section>

        <Section flush title="MRR by plan" description="Active subscriptions; yearly plans count 1/12 of their price.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Plan</TableHead>
                <TableHead scope="col" className="text-right">
                  Monthly
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Yearly
                </TableHead>
                <TableHead scope="col" className="text-right">
                  MRR
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.byPlan.length === 0 && <EmptyRow colSpan={4}>No active subscriptions.</EmptyRow>}
              {subscriptions.byPlan.map((p) => (
                <TableRow key={p.planId}>
                  <TableCell className="font-medium">{getPlan(p.planId).name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.monthly}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.yearly}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(p.mrrCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {subscriptions.byPlan.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableHead scope="row">Total</TableHead>
                  <TableCell className="text-right tabular-nums" colSpan={2}>
                    {formatNumber(subscriptions.active)} active
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(subscriptions.mrrCents)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </Section>
      </div>

      <Section
        className="mt-6"
        flush
        title="Provider cost vs revenue"
        description="Estimated AI provider cost of jobs that reached a provider, against net revenue for the same period."
      >
        <dl className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-4 sm:px-6">
          {[
            { label: "Net revenue", value: formatCents(revenue.netCents) },
            { label: "Provider cost", value: formatCostUsd(providerCost.totalUsd) },
            { label: "Gross margin (est.)", value: formatCents(margin.grossMarginCents) },
            { label: "Margin", value: formatPercent(margin.marginRate) },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Job type</TableHead>
              <TableHead scope="col" className="text-right">
                Jobs
              </TableHead>
              <TableHead scope="col" className="text-right">
                Failed
              </TableHead>
              <TableHead scope="col" className="text-right">
                Cost
              </TableHead>
              <TableHead scope="col" className="text-right">
                Avg / job
              </TableHead>
              <TableHead scope="col" className="text-right">
                Credits net
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.byType.length === 0 && <EmptyRow colSpan={6}>No jobs in this period.</EmptyRow>}
            {jobs.byType.map((t) => (
              <TableRow key={t.type}>
                <TableCell className="font-medium">{humanize(t.type)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(t.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(t.failed)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCostUsd(t.costUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCostUsd(t.avgCostUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(t.creditsCharged - t.creditsRefunded)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {jobs.byType.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableHead scope="row">All jobs</TableHead>
                <TableCell className="text-right tabular-nums">{formatNumber(jobs.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(jobs.byStatus.failed)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCostUsd(providerCost.totalUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCostUsd(providerCost.avgPerJobUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(stats.credits.consumed)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section flush title="Daily breakdown" description="Days with payments or refunds.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Day</TableHead>
                <TableHead scope="col" className="text-right">
                  Gross
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Refunds
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Net
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daysWithActivity.length === 0 && <EmptyRow colSpan={4}>No payments in this period.</EmptyRow>}
              {daysWithActivity.map((d) => (
                <TableRow key={d.date}>
                  <TableHead scope="row" className="font-normal">
                    {formatDayKey(d.date)}
                  </TableHead>
                  <TableCell className="text-right tabular-nums">{formatCents(d.grossCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.refundsCents ? `−${formatCents(d.refundsCents)}` : "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCents(d.netCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section
          flush
          title="Payments"
          description={cursor ? "Older payments in this period." : "Newest first, 50 per page."}
          action={
            cursor && (
              <Link href={`/admin/revenue?days=${days}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Newest
              </Link>
            )
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">User</TableHead>
                <TableHead scope="col">Product</TableHead>
                <TableHead scope="col" className="text-right">
                  Amount
                </TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentPage.payments.length === 0 && <EmptyRow colSpan={5}>No payments in this period.</EmptyRow>}
              {paymentPage.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground" title={formatDateTime(p.createdAt)}>
                    {formatDate(p.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    <Link href={`/admin/users/${p.userId}`} className="underline-offset-4 hover:underline">
                      {p.userEmail ?? p.userId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {p.productId}
                    <span className="block text-xs text-muted-foreground">
                      {humanize(p.kind)} · {p.provider}
                      {p.credits ? ` · ${formatNumber(p.credits)} cr` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(p.amountCents)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <NextPageLink
            pathname="/admin/revenue"
            query={{ days: String(days) }}
            cursor={paymentPage.nextCursor}
            onLaterPage={Boolean(cursor)}
          />
        </Section>
      </div>
    </>
  );
}
