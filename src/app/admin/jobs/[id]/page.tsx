import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { JobStatusBadge, StatusBadge } from "@/components/admin/badges";
import {
  formatCostUsd,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatSignedCredits,
  humanize,
  summarizeDetails,
} from "@/components/admin/format";
import { JobRefundButton } from "@/components/admin/job-refund-button";
import { EmptyRow, KpiCard, Section } from "@/components/admin/section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminJobDetail, isTerminalJobStatus, type AdminJobDetail } from "@/server/admin";
import { requireAdminPage } from "@/server/auth/session";
import { AppError } from "@/server/http";

export const metadata: Metadata = { title: "Job" };

async function loadJob(id: string): Promise<AdminJobDetail> {
  try {
    return await getAdminJobDetail(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

function Json({ value, label }: { value: unknown; label: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
    >
      {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Job inspector: everything about one job (timing, provider, credits, outputs, safety). */
export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const { job, ledger, media, events } = await loadJob(id);
  const refundable = job.creditsCharged - job.creditsRefunded;
  const terminal = isTerminalJobStatus(job.status);
  const runtimeMs =
    job.submittedAt && job.completedAt ? job.completedAt.getTime() - job.submittedAt.getTime() : null;

  const facts: [string, React.ReactNode][] = [
    ["Created", formatDateTime(job.createdAt)],
    ["Submitted", formatDateTime(job.submittedAt)],
    ["Completed", formatDateTime(job.completedAt)],
    ["Last provider poll", formatDateTime(job.lastPolledAt)],
    ["Attempts", formatNumber(job.attempts)],
    ["Provider", job.provider ?? "—"],
    ["Endpoint", job.providerEndpoint ? <code className="text-xs break-all">{job.providerEndpoint}</code> : "—"],
    ["Provider request", job.providerRequestId ? <code className="text-xs break-all">{job.providerRequestId}</code> : "—"],
    [
      "Model",
      job.modelId ? <code className="text-xs break-all">{job.modelId}</code> : "—",
    ],
    ["Pack", job.packId ?? "—"],
    [
      "Batch",
      job.batchId ? <code className="text-xs break-all">{job.batchId}</code> : "—",
    ],
    ["Via", job.apiKeyId ? `API key ${job.apiKeyId}` : "App"],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/jobs", label: "Jobs" }}
        title={`${humanize(job.type)} job`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{job.id}</code>
            <span>
              by{" "}
              <Link href={`/admin/users/${job.userId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {job.userEmail ?? job.userId}
              </Link>
            </span>
          </span>
        }
        actions={
          terminal && refundable > 0 ? (
            <JobRefundButton jobId={job.id} refundable={refundable} userEmail={job.userEmail} />
          ) : undefined
        }
      />

      {job.error && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{job.errorCode ? humanize(job.errorCode) : "Error"}</AlertTitle>
          <AlertDescription className="break-words">{job.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Progress" value={`${job.progress}%`} hint={terminal ? "Finished" : "In progress"} />
        <KpiCard
          label="Credits"
          value={`${formatNumber(job.creditsCharged)} charged`}
          hint={`${formatNumber(job.creditsRefunded)} refunded`}
        />
        <KpiCard label="Provider cost (est.)" value={job.submittedAt ? formatCostUsd(job.costUsd) : "—"} />
        <KpiCard label="Run time" value={runtimeMs === null ? "—" : formatDuration(runtimeMs)} hint="submitted → completed" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Details">
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section flush title="Credits" description="Every ledger entry for this job.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Reason</TableHead>
                <TableHead scope="col" className="text-right">
                  Change
                </TableHead>
                <TableHead scope="col">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 && <EmptyRow colSpan={4}>No credits moved (free job).</EmptyRow>}
              {ledger.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell>{humanize(e.reason)}</TableCell>
                  <TableCell className={e.delta < 0 ? "text-right tabular-nums" : "text-right text-success tabular-nums"}>
                    {formatSignedCredits(e.delta)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={e.note ?? undefined}>
                    {e.note ?? "—"}
                    {e.createdBy && <span className="ml-1 text-xs text-muted-foreground">(admin)</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section flush title={`Outputs (${media.length})`} description="Media this job produced.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Media</TableHead>
                <TableHead scope="col">Kind</TableHead>
                <TableHead scope="col">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {media.length === 0 && <EmptyRow colSpan={3}>No outputs.</EmptyRow>}
              {media.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <code className="text-xs">{m.id}</code>
                  </TableCell>
                  <TableCell>
                    {humanize(m.kind)}
                    {m.isDraft && <span className="ml-1 text-xs text-muted-foreground">(draft)</span>}
                  </TableCell>
                  <TableCell>
                    {m.removedAt ? (
                      <StatusBadge value="removed" tone="destructive" />
                    ) : m.deletedAt ? (
                      <StatusBadge value="deleted by user" tone="secondary" />
                    ) : (
                      <StatusBadge value="live" tone="success" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section flush title={`Safety events (${events.length})`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Kind</TableHead>
                <TableHead scope="col">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && <EmptyRow colSpan={3}>No safety events.</EmptyRow>}
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell>{humanize(e.kind)}</TableCell>
                  <TableCell className="max-w-80 min-w-48 whitespace-normal">
                    <code className="line-clamp-3 text-xs break-all">{summarizeDetails(e.details)}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Input" description="The validated request, as stored.">
          <Json value={job.input} label="Job input JSON" />
        </Section>
        <Section title="Output" description="Provider result metadata (trained-weight references redacted).">
          <Json value={job.output} label="Job output JSON" />
        </Section>
      </div>
    </>
  );
}
