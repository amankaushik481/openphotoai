"use client";

import * as React from "react";
import { HistoryIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JOB_TYPE_LABELS } from "@/config/credits";
import { useT } from "@/i18n/react";
import { api, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CreditLedgerEntryDTO, JobType } from "@/types/domain";
import { CREDIT_REASON_LABELS, formatCreditDelta, formatCredits } from "./format";
import { LocalDate } from "./local-date";

export interface CreditsPage {
  balance: number;
  ledger: CreditLedgerEntryDTO[];
  nextCursor: string | null;
  /** Job id → job type for the page's job entries (absent when there are none). */
  jobTypes?: Record<string, JobType>;
}

export const CREDITS_PAGE_SIZE = 20;
export const CREDITS_KEY = `/api/credits?limit=${CREDITS_PAGE_SIZE}`;

/** Title + detail line of a ledger row: what the credits were for, in plain words. */
export function describeLedgerEntry(
  entry: Pick<CreditLedgerEntryDTO, "reason" | "jobId" | "note">,
  jobTypes: Record<string, JobType> = {},
): { title: string; detail: string | null } {
  const jobType = entry.jobId ? jobTypes[entry.jobId] : undefined;
  const jobLabel = jobType ? JOB_TYPE_LABELS[jobType] : null;
  if (entry.reason === "job_debit") {
    return { title: jobLabel ?? "Used for a job", detail: entry.note };
  }
  if (entry.reason === "job_refund") {
    const detail = [jobLabel, entry.note].filter(Boolean).join(" · ");
    return { title: CREDIT_REASON_LABELS.job_refund, detail: detail || null };
  }
  return { title: CREDIT_REASON_LABELS[entry.reason], detail: entry.note };
}

/** Credit ledger table; the first page comes from the parent (SWR), older pages load on demand. */
export function CreditHistory({ firstPage }: { firstPage: CreditsPage }) {
  const t = useT();
  const [older, setOlder] = React.useState<{
    entries: CreditLedgerEntryDTO[];
    cursor: string | null;
    jobTypes: Record<string, JobType>;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);

  // De-duplicate: the first page shifts when new entries arrive while older pages are loaded.
  const entries = React.useMemo(() => {
    const seen = new Set<string>();
    return [...firstPage.ledger, ...(older?.entries ?? [])].filter((e) => !seen.has(e.id) && seen.add(e.id));
  }, [firstPage.ledger, older]);
  const jobTypes = React.useMemo(() => ({ ...older?.jobTypes, ...firstPage.jobTypes }), [firstPage.jobTypes, older]);
  const cursor = older ? older.cursor : firstPage.nextCursor;

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await api<CreditsPage>(`${CREDITS_KEY}&cursor=${encodeURIComponent(cursor)}`);
      setOlder((prev) => ({
        entries: [...(prev?.entries ?? []), ...page.ledger],
        cursor: page.nextCursor,
        jobTypes: { ...prev?.jobTypes, ...page.jobTypes },
      }));
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't load more history. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!entries.length) {
    return (
      <EmptyState
        size="sm"
        icon={<HistoryIcon />}
        title={t("empty.creditHistory")}
        description={t("empty.creditHistoryBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <Table scrollLabel="Credit history table">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="hidden pr-4 text-right sm:table-cell">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const { title, detail } = describeLedgerEntry(e, jobTypes);
              return (
                <TableRow key={e.id}>
                  <TableCell className="pl-4 align-top whitespace-nowrap text-muted-foreground">
                    <LocalDate iso={e.createdAt} />
                  </TableCell>
                  <TableCell className="max-w-[12rem] align-top whitespace-normal sm:max-w-none">
                    <span className="font-medium">{title}</span>
                    {detail && <span className="block text-xs break-words text-muted-foreground">{detail}</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right align-top font-medium tabular-nums",
                      e.delta > 0 ? "text-success" : "text-foreground",
                    )}
                  >
                    {formatCreditDelta(e.delta)}
                    <span className="block text-xs font-normal whitespace-nowrap text-muted-foreground sm:hidden">
                      Bal. {formatCredits(e.balanceAfter)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden pr-4 text-right align-top text-muted-foreground tabular-nums sm:table-cell">
                    {formatCredits(e.balanceAfter)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={loading} aria-busy={loading} className="self-center">
          {loading && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          {loading ? "Loading…" : "Show older entries"}
        </Button>
      )}
    </div>
  );
}
