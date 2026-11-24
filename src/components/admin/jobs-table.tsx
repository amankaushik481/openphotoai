import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminJobItem } from "@/server/admin";
import { JobStatusBadge } from "./badges";
import { formatCostUsd, formatDateTime, humanize } from "./format";
import { JobRefundButton } from "./job-refund-button";
import { EmptyRow } from "./section";

export function JobsTable({
  jobs,
  showUser = true,
  showActions = true,
  empty = "No jobs match these filters.",
}: {
  jobs: readonly AdminJobItem[];
  showUser?: boolean;
  showActions?: boolean;
  empty?: string;
}) {
  const columns = 8 + (showUser ? 1 : 0) + (showActions ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Created</TableHead>
          {showUser && <TableHead scope="col">User</TableHead>}
          <TableHead scope="col">Type</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col">Provider</TableHead>
          <TableHead scope="col">Error</TableHead>
          <TableHead scope="col" className="text-right">
            Cost
          </TableHead>
          <TableHead scope="col" className="text-right">
            Charged
          </TableHead>
          <TableHead scope="col" className="text-right">
            Refunded
          </TableHead>
          {showActions && (
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.length === 0 && <EmptyRow colSpan={columns}>{empty}</EmptyRow>}
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="text-muted-foreground">
              <span title={job.id}>{formatDateTime(job.createdAt)}</span>
            </TableCell>
            {showUser && (
              <TableCell className="max-w-56 truncate">
                <Link href={`/admin/users/${job.userId}`} className="font-medium underline-offset-4 hover:underline">
                  {job.userEmail ?? job.userId}
                </Link>
              </TableCell>
            )}
            <TableCell>{humanize(job.type)}</TableCell>
            <TableCell>
              <JobStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {job.provider ?? "—"}
              {job.providerEndpoint && <span className="block max-w-48 truncate text-xs">{job.providerEndpoint}</span>}
            </TableCell>
            <TableCell className="max-w-72 min-w-40 whitespace-normal">
              {job.error ? (
                <span className="line-clamp-2 text-xs" title={job.error}>
                  {job.errorCode && <code className="mr-1 rounded bg-muted px-1 py-0.5">{job.errorCode}</code>}
                  {job.error}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{job.submittedAt ? formatCostUsd(job.costUsd) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{job.creditsCharged}</TableCell>
            <TableCell className="text-right tabular-nums">{job.creditsRefunded}</TableCell>
            {showActions && (
              <TableCell className="text-right">
                <JobRefundButton
                  jobId={job.id}
                  refundable={job.creditsCharged - job.creditsRefunded}
                  userEmail={job.userEmail}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
