"use client";

import * as React from "react";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api-client";

/**
 * SWR defaults for the signed-in shells (/app, /admin). Not mounted in the root layout so the static
 * marketing pages don't ship SWR. Every hook passes its fetcher explicitly; the default is a fallback.
 */
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ fetcher, errorRetryCount: 3 }}>{children}</SWRConfig>;
}
