"use client";

import * as React from "react";
import { HistoryIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CreditLedgerEntryDTO } from "@/types/domain";
import { CREDIT_REASON_LABELS, formatCredits, formatDate } from "./format";

export interface CreditsPage {
  balance: number;
  ledger: CreditLedgerEntryDTO[];
  nextCursor: string | null;
}

export const CREDITS_PAGE_SIZE = 20;
export const CREDITS_KEY = `/api/credits?limit=${CREDITS_PAGE_SIZE}`;

/** Credit ledger table; the first page comes from the parent (SWR), older pages load on demand. */
export function CreditHistory({ firstPage }: { firstPage: CreditsPage }) {
  const [older, setOlder] = React.useState<{ entries: CreditLedgerEntryDTO[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = React.useState(false);

  // De-duplicate: the first page shifts when new entries arrive while older pages are loaded.
  const entries = React.useMemo(() => {
    const seen = new Set<string>();
    return [...firstPage.ledger, ...(older?.entries ?? [])].filter((e) => !seen.has(e.id) && seen.add(e.id));
  }, [firstPage.ledger, older]);
  const cursor = older ? older.cursor : firstPage.nextCursor;

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api<CreditsPage>(`${CREDITS_KEY}&cursor=${encodeURIComponent(cursor)}`);
      setOlder((prev) => ({ entries: [...(prev?.entries ?? []), ...page.ledger], cursor: page.nextCursor }));
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't load more history.");
    } finally {
      setLoading(false);
    }
  }

  if (!entries.length) {
    return (
      <EmptyState
        size="sm"
        icon={<HistoryIcon />}
        title="No credit activity yet"
        description="Purchases, plan credits, usage and refunds will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead className="hidden pr-4 text-right sm:table-cell">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">
                  <time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
                </TableCell>
                <TableCell className="max-w-[14rem] sm:max-w-none">
                  <span className="font-medium">{CREDIT_REASON_LABELS[e.reason]}</span>
                  {e.note && <span className="block truncate text-xs text-muted-foreground">{e.note}</span>}
                </TableCell>
                <TableCell
                  className={cn("text-right font-medium tabular-nums", e.delta > 0 ? "text-success" : "text-foreground")}
                >
                  {e.delta > 0 ? "+" : "−"}
                  {formatCredits(Math.abs(e.delta))}
                </TableCell>
                <TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
                  {formatCredits(e.balanceAfter)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={loading} aria-busy={loading} className="self-center">
          {loading && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  );
}
