import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BanIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge, PlanBadge, StatusBadge, UserFlags } from "@/components/admin/badges";
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatNumber,
  formatSignedCredits,
  humanize,
  summarizeDetails,
} from "@/components/admin/format";
import { JobsTable } from "@/components/admin/jobs-table";
import { EmptyRow, KpiCard, Section } from "@/components/admin/section";
import { UserActions } from "@/components/admin/user-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPlan } from "@/config/plans";
import { AppError } from "@/server/http";
import { getUserDetail, REPORT_REASON_LABELS, type AdminUserDetail } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "User" };

const SECTIONS = [
  { id: "ledger", label: "Credits" },
  { id: "jobs", label: "Jobs" },
  { id: "models", label: "Models" },
  { id: "billing", label: "Billing" },
  { id: "moderation", label: "Moderation" },
];

async function loadDetail(id: string): Promise<AdminUserDetail> {
  try {
    return await getUserDetail(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const detail = await loadDetail(id);
  const { user } = detail;
  const canSuspend = user.role !== "admin" && user.id !== admin.id;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "Users" }}
        title={<span className="break-all">{user.email}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{user.name || "No name"}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{user.id}</code>
            <UserFlags role={user.role} banned={user.banned} deletedAt={user.deletedAt} hasPaid={user.hasPaid} />
          </span>
        }
        actions={<UserActions userId={user.id} email={user.email} banned={user.banned} canSuspend={canSuspend} />}
      />

      {user.banned && (
        <Alert variant="destructive" className="mb-6">
          <BanIcon aria-hidden="true" />
          <AlertTitle>Suspended</AlertTitle>
          <AlertDescription>
            {user.banReason ?? "No reason recorded."}
            {user.banExpires && <> · until {formatDateTime(user.banExpires)}</>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Plan" value={<PlanBadge plan={user.plan} />} hint={getPlan(user.plan).description} />
        <KpiCard label="Balance" value={formatNumber(detail.balance)} hint="credits" />
        <KpiCard
          label="Media"
          value={formatNumber(detail.media.total)}
          hint={detail.media.removed ? `${detail.media.removed} removed by moderation` : "photos + videos"}
        />
        <KpiCard
          label="Joined"
          value={formatDate(user.createdAt)}
          hint={`${user.emailVerified ? "Email verified" : "Email not verified"} · ${user.locale}`}
        />
      </div>

      <nav aria-label="Sections" className="my-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6">
        <Section id="ledger" flush title="Credit ledger" description="Newest 50 entries.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Reason</TableHead>
                <TableHead scope="col" className="text-right">
                  Change
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Balance
                </TableHead>
                <TableHead scope="col">Note</TableHead>
                <TableHead scope="col">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.ledger.length === 0 && <EmptyRow colSpan={6}>No credit activity yet.</EmptyRow>}
              {detail.ledger.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell>{humanize(e.reason)}</TableCell>
                  <TableCell className={e.delta < 0 ? "text-right text-destructive tabular-nums" : "text-right text-success tabular-nums"}>
                    {formatSignedCredits(e.delta)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(e.balanceAfter)}</TableCell>
                  <TableCell className="max-w-72 truncate" title={e.note ?? undefined}>
                    {e.note ?? (e.jobId ? <code className="text-xs">{e.jobId}</code> : "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.createdBy ? (
                      <Link href={`/admin/users/${e.createdBy}`} className="underline-offset-4 hover:underline">
                        admin
                      </Link>
                    ) : (
                      "system"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section id="jobs" flush title="Jobs" description="Newest 50 jobs with provider cost and credits.">
          <JobsTable jobs={detail.jobs} showUser={false} empty="No jobs yet." />
        </Section>

        <Section id="models" flush title="Identity models">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Mode</TableHead>
                <TableHead scope="col">Created</TableHead>
                <TableHead scope="col">Trained</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.models.length === 0 && <EmptyRow colSpan={5}>No models.</EmptyRow>}
              {detail.models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="max-w-56 truncate font-medium" title={m.id}>
                    {m.name}
                    {m.deletedAt && <span className="ml-2 text-xs text-muted-foreground">(deleted)</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={m.status} tone={m.status === "failed" ? "destructive" : m.status === "ready" ? "success" : "outline"} />
                  </TableCell>
                  <TableCell>{m.mode ? humanize(m.mode) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(m.trainedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <div id="billing" className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Section flush title="Subscriptions">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Plan</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Renews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.subscriptions.length === 0 && <EmptyRow colSpan={3}>No subscriptions.</EmptyRow>}
                {detail.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {getPlan(s.planId).name} <span className="text-muted-foreground">/ {s.interval}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={s.status} tone={s.status === "active" ? "success" : s.status === "past_due" ? "warning" : "outline"} />
                      {s.cancelAtPeriodEnd && <span className="ml-2 text-xs text-muted-foreground">cancels at period end</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.currentPeriodEnd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section flush title="Payments" description="Newest 50.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">When</TableHead>
                  <TableHead scope="col">Product</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.payments.length === 0 && <EmptyRow colSpan={4}>No payments.</EmptyRow>}
                {detail.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                    <TableCell>{p.productId}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(p.amountCents)}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>

        <div id="moderation" className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Section flush title="Reports against this user">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">When</TableHead>
                  <TableHead scope="col">Reason</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.reports.length === 0 && <EmptyRow colSpan={4}>No reports.</EmptyRow>}
                {detail.reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>{REPORT_REASON_LABELS[r.reason]}</TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} tone={r.status === "open" ? "warning" : "outline"} />
                    </TableCell>
                    <TableCell className="max-w-60 truncate" title={r.resolution ?? undefined}>
                      {r.resolution ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section flush title="Safety events" description="Newest 50 (blocked prompts, outputs, consent checks, admin actions).">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">When</TableHead>
                  <TableHead scope="col">Kind</TableHead>
                  <TableHead scope="col">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.moderationEvents.length === 0 && <EmptyRow colSpan={3}>No safety events.</EmptyRow>}
                {detail.moderationEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>
                      {humanize(e.kind)}
                      {!e.reviewed && <span className="ml-2 text-xs text-warning">unreviewed</span>}
                    </TableCell>
                    <TableCell className="max-w-80 min-w-48 whitespace-normal">
                      <code className="line-clamp-2 text-xs break-all">{summarizeDetails(e.details)}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>
      </div>
    </>
  );
}
