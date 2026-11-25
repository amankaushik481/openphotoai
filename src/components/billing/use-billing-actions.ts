"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, apiErrorText } from "@/lib/api-client";
import type { CheckoutItem } from "@/providers/types";

/*
 * At most one checkout / portal redirect at a time across the whole page. Every card grid has its own
 * hook instance (packs, plans, current plan, checkout-intent dialog), so per-instance state alone let a
 * fast second click, on the same button before it re-rendered or on another card, start a second
 * checkout while the first one was still being created.
 */
let inFlight: string | null = null;
const listeners = new Set<() => void>();

function setInFlight(key: string | null) {
  inFlight = key;
  for (const notify of listeners) notify();
}

/** The redirect in flight (its key), if any. */
export function pendingBillingRedirect(): string | null {
  return inFlight;
}

/** Forget the redirect in flight (back/forward-cache restore, tests). */
export function resetBillingRedirect(): void {
  setInFlight(null);
}

export interface RedirectDeps {
  navigate: (url: string) => void;
  onError: (err: unknown) => void;
}

const browserDeps: RedirectDeps = {
  navigate: (url) => window.location.assign(url),
  onError: (err) => toast.error(apiErrorText(err)),
};

/**
 * Create a checkout / portal session and navigate to it. Returns false without calling `request` while
 * another redirect is in flight. The key stays set after a successful request (the page is navigating
 * away, buttons keep their spinner); a failure clears it.
 */
export async function startBillingRedirect(
  key: string,
  request: () => Promise<{ url: string }>,
  deps: RedirectDeps = browserDeps,
): Promise<boolean> {
  if (inFlight !== null) return false;
  setInFlight(key);
  try {
    const { url } = await request();
    deps.navigate(url);
    return true;
  } catch (err) {
    setInFlight(null);
    deps.onError(err);
    return false;
  }
}

/**
 * Checkout + portal redirects. `pending` holds the key of the action in flight. Coming back with the
 * Back button to a page restored from the back/forward cache clears it, so buttons aren't stuck spinning.
 */
export function useBillingActions() {
  const pending = React.useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => inFlight,
    () => null,
  );

  React.useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetBillingRedirect();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const checkout = React.useCallback(
    (item: CheckoutItem, key: string) =>
      startBillingRedirect(key, () => api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { item } })),
    [],
  );

  const openPortal = React.useCallback(
    () => startBillingRedirect("portal", () => api<{ url: string }>("/api/billing/portal", { method: "POST" })),
    [],
  );

  return { pending, checkout, openPortal };
}
