"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, XIcon } from "lucide-react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getPlan } from "@/config/plans";
import type { SubscriptionDTO } from "@/server/billing/types";
import { formatCredits, formatPrice } from "./format";
import { LocalDate } from "./local-date";
import { isUpgrade, lostFeatures } from "./plan-change";
import type { PlanCheckoutItem } from "./plan-cards";

export interface PlanChangeDialogProps {
  /** The plan being switched to (null = closed). */
  item: PlanCheckoutItem | null;
  /** The live subscription being replaced. */
  current: SubscriptionDTO;
  balance: number;
  onOpenChange: (open: boolean) => void;
  /** Starts the checkout (navigates away on success; throws to keep the dialog open). */
  onConfirm: (item: PlanCheckoutItem) => Promise<void>;
}

/** Spells out what a plan switch does before the checkout starts (PAY-14: no proration). */
export function PlanChangeDialog({ item, current, balance, onOpenChange, onConfirm }: PlanChangeDialogProps) {
  if (!item) return null;
  const from = getPlan(current.planId);
  const to = getPlan(item.planId);
  const upgrade = isUpgrade(current.planId, item.planId);
  const yearly = item.interval === "year";
  const price = yearly ? to.yearlyPriceCents : to.monthlyPriceCents;
  const credits = yearly ? to.monthlyCredits * 12 : to.monthlyCredits;
  const lost = lostFeatures(current.planId, item.planId);

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`${upgrade ? "Upgrade" : "Switch"} from ${from.name} to ${to.name}?`}
      description={`You'll pay ${formatPrice(price)} ${yearly ? "for a year" : "per month"} at checkout.`}
      confirmLabel="Continue to checkout"
      cancelLabel={`Keep ${from.name}`}
      onConfirm={() => onConfirm(item)}
    >
      <ul className="grid gap-2 text-sm">
        <li className="flex gap-2">
          {upgrade ? (
            <ArrowUpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <ArrowDownIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {to.name} starts today with a new {yearly ? "yearly" : "monthly"} billing period and adds{" "}
            <strong className="font-medium">{formatCredits(credits)} credits</strong>
            {yearly ? " up front" : ""}.
          </span>
        </li>
        <li className="flex gap-2">
          <XIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            Your {from.name} subscription ends right away, without a refund for the time left
            {current.currentPeriodEnd ? (
              <>
                {" "}
                (paid until <LocalDate iso={current.currentPeriodEnd} />)
              </>
            ) : null}
            .
          </span>
        </li>
        <li className="flex gap-2">
          <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <span>You keep all {formatCredits(balance)} credits you have now.</span>
        </li>
        {lost.map((text) => (
          <li key={text} className="flex gap-2">
            <XIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
