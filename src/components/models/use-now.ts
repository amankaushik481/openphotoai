"use client";

import * as React from "react";

/**
 * The current time, refreshed every `ms` so time-based copy (the ETA) stays fresh between polls.
 * Null until mounted: server and client clocks differ, so the first render must not depend on it.
 */
export function useNow(ms: number, active: boolean): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ms, active]);
  return now;
}
