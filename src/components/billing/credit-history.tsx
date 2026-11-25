"use client";

import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

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
  const title = CREDIT_REASON_LABELS[entry.reason];
  return { title, detail: withoutRepeatedTitle(entry.note, title) };
}

/** "100 credits credit pack" under the title "Credit pack" reads twice: keep just "100 credits". */
function withoutRepeatedTitle(note: string | null, title: string): string | null {
  if (!note) return null;
  const n = note.trim();
  if (n.toLowerCase() === title.toLowerCase()) return null;
  if (n.toLowerCase().endsWith(` ${title.toLowerCase()}`)) return n.slice(0, -(title.length + 1)).trim() || null;
  return n;
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
      <div className="flex flex-col gap-1.5 border-y-2 border-double border-foreground/40 py-6">
        <p aria-hidden="true" className="mono-caps text-muted-foreground">
          Ledger · no entries
        </p>
        <h3 className="font-display text-2xl leading-none">{t("empty.creditHistory")}</h3>
        <p className="text-sm text-muted-foreground">{t("empty.creditHistoryBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The lab ledger: mono figures, dotted leaders from each entry to its amount, double rules top and bottom. */}
      <div className="border-y-[3px] border-double border-foreground/50 font-mono">
        <Table scrollLabel="Credit history table">
          <TableHeader>
            <TableRow className="border-foreground/30 hover:bg-transparent">
              <TableHead className="h-9 pl-0 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Date</TableHead>
              <TableHead className="h-9 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Description</TableHead>
              <TableHead className="h-9 text-right text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Credits</TableHead>
              <TableHead className="hidden h-9 pr-0 text-right text-[10px] tracking-[0.16em] text-muted-foreground uppercase sm:table-cell">
                Balance
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const { title, detail } = describeLedgerEntry(e, jobTypes);
              return (
                <TableRow key={e.id} className="border-dashed border-foreground/15 hover:bg-accent/40">
                  <TableCell className="pl-0 align-top text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    <LocalDate iso={e.createdAt} />
                  </TableCell>
                  <TableCell className="max-w-[12rem] align-top whitespace-normal sm:max-w-none">
                    <span className="flex items-baseline gap-2">
                      <span className="font-sans font-medium">{title}</span>
                      <span aria-hidden="true" className="hidden min-w-6 flex-1 border-b border-dotted border-foreground/35 sm:block" />
                    </span>
                    {detail && <span className="block font-sans text-xs break-words text-muted-foreground">{detail}</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right align-top font-medium tabular-nums",
                      e.delta > 0 ? "text-success" : "text-foreground",
                    )}
                  >
                    {formatCreditDelta(e.delta)}
                    <span className="block text-[11px] font-normal whitespace-nowrap text-muted-foreground sm:hidden">
                      Bal. {formatCredits(e.balanceAfter)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden pr-0 text-right align-top text-muted-foreground tabular-nums sm:table-cell">
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
