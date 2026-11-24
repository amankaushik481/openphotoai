import Link from "next/link";

import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/** A titled card. `min-w-0` keeps wide tables from widening the page on phones. */
export function Section({ title, description, action, flush, className, id, children }: SectionProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Card
      id={id}
      aria-labelledby={headingId}
      role={id ? "region" : undefined}
      className={cn("min-w-0 gap-4 overflow-hidden py-5", className)}
    >
      <CardHeader className="px-4 sm:px-6">
        <CardTitle id={headingId} className="text-base">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <div
        className={cn(
          "min-w-0",
          flush
            ? "border-t [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:first-child]:pl-6 sm:[&_th:last-child]:pr-6"
            : "px-4 sm:px-6",
        )}
      >
        {children}
      </div>
    </Card>
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
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight break-words tabular-nums",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </>
  );
  const classes = "flex min-w-0 flex-col rounded-xl border bg-card px-4 py-3.5 shadow-xs";
  return href ? (
    <Link
      href={href}
      className={cn(
        classes,
        "transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
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

/** "Next page" link that keeps the current query (cursor pagination). */
export function NextPageLink({
  pathname,
  query,
  cursor,
}: {
  pathname: string;
  query: Record<string, string | undefined>;
  cursor: string | null;
}) {
  if (!cursor) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value && key !== "cursor") params.set(key, value);
  params.set("cursor", cursor);
  return (
    <div className="flex justify-end px-4 pt-4 sm:px-6">
      <Link
        href={`${pathname}?${params.toString()}`}
        className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Next page →
      </Link>
    </div>
  );
}

/** Period switcher (7 / 30 / 90 days) as plain links. */
export function PeriodLinks({ pathname, days, options = [7, 30, 90] }: { pathname: string; days: number; options?: number[] }) {
  return (
    <nav aria-label="Period" className="flex rounded-lg border bg-card p-0.5 text-sm">
      {options.map((d) => (
        <Link
          key={d}
          href={`${pathname}?days=${d}`}
          aria-current={d === days ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
