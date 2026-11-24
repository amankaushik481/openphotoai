"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api-client";
import type { CheckoutItem } from "@/providers/types";

function message(err: unknown): string {
  return err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.";
}

/**
 * Checkout + portal redirects. `pending` holds the key of the action in flight (it stays set while
 * the browser navigates away, so buttons keep their spinner).
 */
export function useBillingActions() {
  const [pending, setPending] = React.useState<string | null>(null);

  const redirect = React.useCallback(async (key: string, request: () => Promise<{ url: string }>) => {
    setPending(key);
    try {
      const { url } = await request();
      window.location.assign(url);
    } catch (err) {
      toast.error(message(err));
      setPending(null);
    }
  }, []);

  const checkout = React.useCallback(
    (item: CheckoutItem, key: string) =>
      redirect(key, () => api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { item } })),
    [redirect],
  );

  const openPortal = React.useCallback(
    () => redirect("portal", () => api<{ url: string }>("/api/billing/portal", { method: "POST" })),
    [redirect],
  );

  return { pending, checkout, openPortal };
}
