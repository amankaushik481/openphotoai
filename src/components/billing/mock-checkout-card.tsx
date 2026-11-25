"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircleIcon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCredits, formatPrice } from "./format";
import { LabNotice } from "./lab-notice";

export interface MockCheckoutItemView {
  name: string;
  description: string;
  priceCents: number;
  credits: number;
  /** Set for plan subscriptions. */
  interval?: "month" | "year";
}

export interface MockCheckoutCardProps {
  checkoutId: string;
  item: MockCheckoutItemView;
  email: string;
}

/** The test-mode stand-in for Stripe Checkout. */
export function MockCheckoutCard({ checkoutId, item, email }: MockCheckoutCardProps) {
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const price = formatPrice(item.priceCents);
  const per = item.interval === "year" ? " / year" : item.interval === "month" ? " / month" : "";

  // A ref, not state: a second click (or Enter auto-repeat) can land before the re-render disables the button.
  const inFlight = React.useRef(false);

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPaying(true);
    setError(null);
    try {
      const { redirectUrl } = await api<{ redirectUrl: string }>("/api/billing/mock/complete", {
        method: "POST",
        body: { checkoutId },
      });
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "The test payment failed. Please try again.");
      setPaying(false);
      inFlight.current = false;
    }
  }

  return (
    // A photo-lab order ticket: perforated top and bottom edges, mono figures, a dotted leader to the price.
    <div className="w-full max-w-md border-y-2 border-dashed border-foreground/30 bg-card shadow-[0_18px_40px_-24px_rgb(22_20_15/0.5)]">
      <div className="flex flex-col gap-3 border-b border-foreground/15 px-5 pt-5 pb-4 sm:px-6">
        <p className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          <span>OpenShoot lab · order ticket</span>
          <span aria-hidden="true">No. {checkoutId.slice(-6).toUpperCase()}</span>
        </p>
        <p className="w-fit border border-safelight-ink/60 px-2 py-1.5 font-mono text-[10px] leading-none tracking-[0.14em] text-safelight-ink uppercase">
          Test checkout — no real payment
        </p>
        <h1 className="font-display text-4xl leading-none tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground">
          This app runs with the mock payment provider. Paying here simulates a successful Stripe payment.
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <p className="font-medium">{item.name}</p>
            <span aria-hidden="true" className="min-w-4 flex-1 border-b border-dotted border-foreground/35" />
            <p className="shrink-0 text-right font-mono font-medium tabular-nums">
              {price}
              <span className="text-xs font-normal text-muted-foreground">{per}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{item.description}</p>
          <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
            {formatCredits(item.credits)} credits{item.interval ? (item.interval === "year" ? " up front" : " every month") : ""}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t-2 border-double border-foreground/40 pt-3">
          <span className="mono-caps text-muted-foreground">Total due today</span>
          <span className="font-mono text-2xl font-medium tabular-nums">{price}</span>
        </div>
        <p className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">Paying as {email}</p>
        {error && (
          <LabNotice role="alert" tone="danger" label="Lab notice · declined" title="Payment failed">
            {error}
          </LabNotice>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-foreground/15 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/app/billing?canceled=1" aria-disabled={paying} tabIndex={paying ? -1 : undefined}>
            Cancel
          </Link>
        </Button>
        <Button variant="brand" onClick={pay} disabled={paying} aria-busy={paying} className="w-full sm:w-auto">
          {paying ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <LockIcon aria-hidden="true" />}
          Pay {price}
        </Button>
      </div>
    </div>
  );
}
