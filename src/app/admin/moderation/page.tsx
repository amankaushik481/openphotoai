import type { Metadata } from "next";
import Link from "next/link";
import { FlagIcon, ImageOffIcon, ShieldCheckIcon } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/admin/badges";
import { formatDateTime, summarizeDetails } from "@/components/admin/format";
import { MarkReviewedButton, ReportActions } from "@/components/admin/moderation-actions";
import { EmptyRow, Section } from "@/components/admin/section";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listModerationQueue, REPORT_REASON_LABELS, type QueueReport } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Moderation" };

const SEVERE_REASONS: ReadonlySet<QueueReport["reason"]> = new Set(["minor", "non_consensual", "sexual"]);

function ReportCard({ report, adminId }: { report: QueueReport; adminId: string }) {
  const media = report.media;
  const canRemove = Boolean((media && !media.removedAt) || (report.shareLink && !report.shareLink.revokedAt));
  const canSuspend = Boolean(report.target && !report.target.banned && report.target.role !== "admin" && report.target.id !== adminId);

  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:flex-row">
      <div className="size-28 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-32">
        {media?.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer
          <img
            src={media.thumbUrl}
            alt={media.prompt ? `Reported ${media.kind}: ${media.prompt}` : `Reported ${media.kind}`}
            className="size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
            <ImageOffIcon aria-hidden="true" className="size-5" />
            {media?.removedAt ? "Removed" : report.shareLink?.folderId ? "Folder share" : "No preview"}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={SEVERE_REASONS.has(report.reason) ? "destructive" : "warning"}>{REPORT_REASON_LABELS[report.reason]}</Badge>
          <span className="text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</span>
        </div>
        <p className="text-sm break-words whitespace-pre-line">{report.details || <span className="text-muted-foreground">No details given.</span>}</p>
        <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt>Owner</dt>
          <dd className="min-w-0 truncate">
            {report.target ? (
              <Link href={`/admin/users/${report.target.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {report.target.email}
              </Link>
            ) : (
              "Unknown (deleted)"
            )}
            {report.target?.banned && <span className="ml-2 text-destructive">suspended</span>}
          </dd>
          <dt>Reporter</dt>
          <dd className="min-w-0 truncate">{report.reporterEmail ?? (report.reporterUserId ? "Signed-in user" : "Anonymous")}</dd>
          {report.shareLink && (
            <>
              <dt>Share link</dt>
              <dd className="min-w-0 truncate">
                <code>/s/{report.shareLink.token.slice(0, 8)}…</code>
                {report.shareLink.revokedAt && <span className="ml-2">(revoked)</span>}
              </dd>
            </>
          )}
        </dl>
        <div className="mt-1">
          <ReportActions reportId={report.id} canRemoveMedia={canRemove} canSuspend={canSuspend} />
        </div>
      </div>
    </li>
  );
}

export default async function AdminModerationPage() {
  const admin = await requireAdminPage();
  const { reports, events } = await listModerationQueue();

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Moderation"
        description="Abuse reports from share pages and safety events that blocked something. Newest first."
      />

      <section aria-labelledby="reports-heading" className="mb-8">
        <h2 id="reports-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <FlagIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          Open reports
          <Badge variant={reports.length ? "warning" : "outline"}>{reports.length}</Badge>
        </h2>
        {reports.length === 0 ? (
          <EmptyState size="sm" icon={<ShieldCheckIcon />} title="No open reports" description="New reports from share pages show up here." />
        ) : (
          <ul className="grid gap-3">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} adminId={admin.id} />
            ))}
          </ul>
        )}
      </section>

      <Section
        id="events"
        flush
        title={`Safety events to review (${events.length})`}
        description="Blocked prompts, outputs, references and failed consent checks. Marking an event reviewed removes it from this list."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When</TableHead>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col">User</TableHead>
              <TableHead scope="col">Details</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 && <EmptyRow colSpan={5}>Nothing to review.</EmptyRow>}
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                <TableCell>
                  <StatusBadge value={e.kind} tone={e.kind === "underage" ? "destructive" : "outline"} />
                </TableCell>
                <TableCell className="max-w-56 truncate">
                  {e.userId ? (
                    <Link href={`/admin/users/${e.userId}`} className="underline-offset-4 hover:underline">
                      {e.userEmail ?? e.userId}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {e.jobId && <span className="block truncate text-xs text-muted-foreground">job {e.jobId}</span>}
                </TableCell>
                <TableCell className="max-w-96 min-w-56 whitespace-normal">
                  <code className="line-clamp-3 text-xs break-all" title={JSON.stringify(e.details)}>
                    {summarizeDetails(e.details)}
                  </code>
                </TableCell>
                <TableCell className="text-right">
                  <MarkReviewedButton eventId={e.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
