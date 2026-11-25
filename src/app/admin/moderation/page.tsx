import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/admin/badges";
import { formatDateTime, humanize, summarizeDetails } from "@/components/admin/format";
import { Kbd } from "@/components/admin/kbd";
import { MarkReviewedButton, ReportActions } from "@/components/admin/moderation-actions";
import { TriageKeyboard } from "@/components/admin/triage-keyboard";
import { EmptyRow, Section } from "@/components/admin/section";
import { PencilCircle, PencilCross } from "@/components/gallery/marks";
import { Stamp } from "@/components/gallery/readout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listModerationQueue, REPORT_REASON_LABELS, type QueueReport } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Moderation" };

const SEVERE_REASONS: ReadonlySet<QueueReport["reason"]> = new Set(["minor", "non_consensual", "sexual"]);

function ReportCard({ report, adminId, index }: { report: QueueReport; adminId: string; index: number }) {
  const media = report.media;
  const canRemove = Boolean((media && !media.removedAt) || (report.shareLink && !report.shareLink.revokedAt));
  const canSuspend = Boolean(report.target && !report.target.banned && report.target.role !== "admin" && report.target.id !== adminId);

  return (
    <li
      data-triage-item
      tabIndex={-1}
      aria-label={`Report: ${REPORT_REASON_LABELS[report.reason]}${report.target ? ` against ${report.target.email}` : ""}`}
      className="flex min-w-0 scroll-mt-24 flex-col gap-4 border border-foreground/15 bg-card p-3 shadow-[0_8px_18px_-14px_rgb(22_20_15/0.45)] transition-colors [--focus-offset:-2px] focus-within:border-foreground/40 sm:flex-row sm:p-4 dark:shadow-none"
    >
      {/* The reported frame, as a print with its frame number; severe reports are circled in grease pencil. */}
      <div className="relative w-fit shrink-0 self-start border border-foreground/10 bg-[#fbf8f2] p-1.5 pb-0">
        <div className="size-28 overflow-hidden bg-muted sm:size-32">
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
          <div className="relative flex size-full items-end p-2 font-mono text-[10px] tracking-[0.12em] text-[#615a50] uppercase">
            {media?.removedAt ? "Removed" : report.shareLink?.folderId ? "Folder share" : "No preview"}
            {media?.removedAt && <PencilCross strokeWidth={2} className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]" />}
          </div>
        )}
        </div>
        <p aria-hidden="true" className="flex h-6 items-center font-mono text-[10px] tracking-[0.12em] text-[#615a50]">
          ▸ {String(index + 1).padStart(2, "0")}
        </p>
        {SEVERE_REASONS.has(report.reason) && (
          <PencilCircle variant={index} strokeWidth={2.6} className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)]" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Stamp tone={SEVERE_REASONS.has(report.reason) ? "safelight" : "warning"}>{REPORT_REASON_LABELS[report.reason]}</Stamp>
          <span className="font-mono text-[11px] text-muted-foreground">{formatDateTime(report.createdAt)}</span>
        </div>
        <p className="text-sm break-words whitespace-pre-line">{report.details || <span className="text-muted-foreground">No details given.</span>}</p>
        <dl className="grid gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)] [&_dt]:tracking-[0.12em] [&_dt]:uppercase">
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

      <p className="mb-6 hidden flex-wrap items-center gap-x-3 gap-y-1 border-y border-foreground/15 py-2 text-xs text-muted-foreground pointer-fine:flex">
        <span className="mono-caps text-foreground">Keyboard triage</span>
        <span>
          <Kbd>J</Kbd> / <Kbd>K</Kbd> next / previous
        </span>
        <span>
          <Kbd>D</Kbd> dismiss
        </span>
        <span>
          <Kbd>R</Kbd> remove media
        </span>
        <span>
          <Kbd>S</Kbd> suspend owner
        </span>
        <span>
          <Kbd>M</Kbd> mark reviewed
        </span>
        <span>Every action asks to confirm: Enter (or Ctrl+Enter in a note) applies it, Esc cancels.</span>
      </p>

      <TriageKeyboard>
        <section aria-labelledby="reports-heading" className="mb-8">
          <h2 id="reports-heading" className="mb-3 flex items-center gap-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
            Open reports
            <Stamp tone={reports.length ? "safelight" : "muted"}>{reports.length}</Stamp>
          </h2>
          {/* The light table: reported frames laid out like prints for review. */}
          <div className="border border-foreground/15 bg-secondary p-3 sm:p-5 dark:bg-darkroom-raised">
            {reports.length === 0 ? (
              <div className="flex flex-col gap-1 py-6">
                <p className="mono-caps text-muted-foreground">Light table · clear</p>
                <p className="font-display text-2xl leading-none">No open reports</p>
                <p className="text-sm text-muted-foreground">New reports from share pages show up here.</p>
              </div>
            ) : (
              <ul className="grid gap-4">
                {reports.map((r, i) => (
                  <ReportCard key={r.id} report={r} adminId={admin.id} index={i} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <Section
          id="events"
          flush
          title={`Safety events to review (${events.length})`}
          description="Blocked prompts, outputs, references and failed consent checks. Marking an event reviewed removes it from this list."
        >
          <Table scrollLabel="Safety events to review">
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
                <TableRow
                  key={e.id}
                  data-triage-item
                  tabIndex={-1}
                  aria-label={`Safety event: ${humanize(e.kind)}`}
                  className="scroll-mt-24 [--focus-offset:-2px]"
                >
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
                    <MarkReviewedButton eventId={e.id} kind={humanize(e.kind)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </TriageKeyboard>
    </>
  );
}
