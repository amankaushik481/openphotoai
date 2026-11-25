"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, formatRelativeDay } from "./format";

const subscribeNoop = () => () => {};

/**
 * False during the server render and hydration, true afterwards. Dates rendered with it are formatted
 * in UTC on the server and on the first client render (so hydration always matches, whatever time zone
 * the server and the viewer are in), then switch to the viewer's local day.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/** "today" / "yesterday" / "3 days ago" once hydrated; the UTC date during the server render. */
export function RelativeDay({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useHydrated();
  return (
    <time dateTime={iso} className={className} title={hydrated ? formatDateTime(iso) : undefined}>
      {hydrated ? formatRelativeDay(iso) : formatDate(iso)}
    </time>
  );
}

/**
 * `<time>` showing a date ("Nov 25, 2026") in the viewer's time zone once hydrated, with the full
 * local date and time as a tooltip. Renders "—" for a missing date.
 */
export function LocalDate({ iso, className, withTime = false }: { iso: string | null | undefined; className?: string; withTime?: boolean }) {
  const hydrated = useHydrated();
  if (!iso) return <span className={className}>—</span>;
  const timeZone = hydrated ? undefined : "UTC";
  return (
    <time dateTime={iso} className={className} title={hydrated ? formatDateTime(iso) : undefined}>
      {withTime ? formatDateTime(iso, timeZone) : formatDate(iso, { timeZone })}
    </time>
  );
}
