"use client";

import * as React from "react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getCreditPack, getPlan } from "@/config/plans";
import { api } from "@/lib/api-client";
import type { CheckoutItem } from "@/providers/types";
import type { PlanId } from "@/types/domain";
import { formatCredits, formatPrice } from "./format";

export interface CheckoutIntentDialogProps {
  /** What the visitor picked on the public pricing page before signing in. */
  item: CheckoutItem;
  /** The user's current plan: picking it again needs no checkout. */
  currentPlanId: PlanId;
  /** Called once the dialog closes without leaving the page (clear the URL params here). */
  onDone: () => void;
}

function describe(item: CheckoutItem): { title: string; description: string } | null {
  if (item.type === "plan") {
    const plan = getPlan(item.planId);
    const price =
      item.interval === "year"
        ? `${formatPrice(plan.yearlyPriceCents)} billed yearly (${formatCredits(plan.monthlyCredits * 12)} credits up front)`
        : `${formatPrice(plan.monthlyPriceCents)} per month (${formatCredits(plan.monthlyCredits)} credits every month)`;
    return { title: `Continue to checkout for ${plan.name}?`, description: `${plan.name} plan: ${price}. Cancel anytime.` };
  }
  const pack = getCreditPack(item.packId);
  if (!pack) return null;
  return {
    title: `Buy ${pack.name}?`,
    description: `${formatCredits(pack.credits)} credits for ${formatPrice(pack.priceCents)}, one-time. Credits never expire.`,
  };
}

/**
 * Picks up the plan / pack chosen before signing in: asks once, then starts the checkout.
 * Closing the dialog (or a failed start, after its toast) leaves the user on the billing page.
 */
export function CheckoutIntentDialog({ item, currentPlanId, onDone }: CheckoutIntentDialogProps) {
  const alreadyOnPlan = item.type === "plan" && item.planId === currentPlanId;
  const copy = describe(item);
  const [open, setOpen] = React.useState(!alreadyOnPlan && copy !== null);
  const [leaving, setLeaving] = React.useState(false);

  if (!copy || alreadyOnPlan) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !leaving) onDone();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel="Continue to checkout"
      cancelLabel="Not now"
      onConfirm={async () => {
        const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { item } });
        setLeaving(true);
        window.location.assign(url);
      }}
    />
  );
}
