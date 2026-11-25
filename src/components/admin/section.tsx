import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Tables: rendered edge to edge, scrolling horizontally inside the card only. */
  flush?: boolean;
  className?: string;
  id?: string;
  children: React.ReactNode;
}

/**
 * A titled panel: square, hairline-bordered, with a mono heading. Flush tables are set in mono with tiny
 * uppercase column heads. `min-w-0` keeps wide tables from widening the page on phones.
 */
export function Section({ title, description, action, flush, className, id, children }: SectionProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col gap-3 overflow-hidden border border-foreground/15 bg-card py-4", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="font-mono text-xs font-semibold tracking-[0.14em] uppercase">
            {title}
          </h2>
          {description && <div className="max-w-[70ch] text-xs text-muted-foreground">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div
        className={cn(
          "min-w-0",
          flush
            ? "border-t border-foreground/15 [&_table]:font-mono [&_table]:text-[12.5px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:h-8 [&_th]:text-[10px] [&_th]:tracking-[0.14em] [&_th]:text-muted-foreground [&_th]:uppercase [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_tr]:border-foreground/10 sm:[&_td:first-child]:pl-5 sm:[&_td:last-child]:pr-5 sm:[&_th:first-child]:pl-5 sm:[&_th:last-child]:pr-5"
            : "px-4 sm:px-5",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "warning" | "destructive" | "success";
}) {
  const body = (
    <>
      <dt className="font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 font-mono text-2xl font-medium tracking-tight break-words tabular-nums",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-safelight-ink",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </>
  );
  // A meter readout: hairline frame, a safelight rule on the left when it's an alert.
  const classes = cn(
    "flex min-w-0 flex-col border border-foreground/15 bg-card px-4 py-3",
    tone === "destructive" && "border-l-2 border-l-safelight-ink",
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        classes,
        "transition-colors hover:border-foreground/40 hover:bg-accent/40",
      )}
    >
      <dl>{body}</dl>
    </Link>
  ) : (
    <div className={classes}>
      <dl>{body}</dl>
    </div>
  );
}

/** `pathname?query` without empty values (and never a stale cursor unless given). */
export function hrefWith(pathname: string, query: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Cursor pagination: "First page" (when on a later page) and "Next page" links that keep the current
 * filters. Keyset cursors only go forward, so "back" means the browser's Back or the first page.
 */
export function NextPageLink({
  pathname,
  query,
  cursor,
  onLaterPage = false,
}: {
  pathname: string;
  query: Record<string, string | undefined>;
  /** The next page's cursor (null on the last page). */
  cursor: string | null;
  /** The current page was reached through a cursor. */
  onLaterPage?: boolean;
}) {
  if (!cursor && !onLaterPage) return null;
  const filters = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "cursor"));
  const linkClass = "rounded-sm py-1 font-mono text-xs tracking-[0.1em] uppercase underline underline-offset-4";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 px-4 pt-4 sm:px-6">
      {onLaterPage ? (
        <Link href={hrefWith(pathname, filters)} className={linkClass}>
          ← First page
        </Link>
      ) : (
        <span />
      )}
      {cursor ? (
        <Link href={hrefWith(pathname, { ...filters, cursor })} className={linkClass}>
          Next page →
        </Link>
      ) : (
        <span className="font-mono text-xs tracking-[0.1em] text-muted-foreground uppercase">End of list</span>
      )}
    </nav>
  );
}

/** Period switcher (7 / 30 / 90 days) as plain links. */
export function PeriodLinks({ pathname, days, options = [7, 30, 90] }: { pathname: string; days: number; options?: number[] }) {
  return (
    <nav aria-label="Period" className="flex gap-4 border-b border-foreground/15 font-mono text-xs tracking-[0.12em] uppercase">
      {options.map((d) => (
        <Link
          key={d}
          href={`${pathname}?days=${d}`}
          aria-current={d === days ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 py-2 font-medium transition-colors",
            d === days ? "border-safelight-ink text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {d}d
        </Link>
      ))}
    </nav>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
        {children}
      </td>
    </tr>
  );
}
