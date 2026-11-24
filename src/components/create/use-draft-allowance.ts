"use client";

import * as React from "react";
import { useMe } from "@/hooks/use-me";

/**
 * Free drafts left today: `MeDTO.draftsRemaining` (live, shared SWR cache), `initial` (server-rendered)
 * until /api/me loads, and an optimistic value right after a draft until /api/me reports a new number.
 */
export function useDraftAllowance(initial: number) {
  const { user, mutate } = useMe();
  const server = user?.draftsRemaining;
  const [optimistic, setOptimistic] = React.useState<{ from: number | undefined; value: number } | null>(null);
  const draftsLeft = optimistic && optimistic.from === server ? optimistic.value : (server ?? initial);

  const settle = React.useCallback(
    (value: number) => {
      setOptimistic({ from: server, value: Math.max(0, value) });
      void mutate();
    },
    [server, mutate],
  );

  return {
    draftsLeft,
    /** A draft job was accepted. */
    spend: React.useCallback(() => settle(draftsLeft - 1), [settle, draftsLeft]),
    /** The server said the daily allowance is used up. */
    exhaust: React.useCallback(() => settle(0), [settle]),
  };
}
