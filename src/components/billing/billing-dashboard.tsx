"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { CircleCheckIcon, CoinsIcon, FlaskConicalIcon, InfoIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ME_KEY } from "@/hooks/use-me";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import type { CheckoutItem } from "@/providers/types";
import type { BillingSummaryDTO } from "@/server/billing/types";
import { CheckoutIntentDialog } from "./checkout-intent-dialog";
import { CreditHistory, CREDITS_KEY, type CreditsPage } from "./credit-history";
import { CreditPackCards } from "./credit-pack-cards";
import { CurrentPlanCard } from "./current-plan-card";
import { formatCredits } from "./format";
import { PlanCards } from "./plan-cards";
import { useBillingActions } from "./use-billing-actions";

export const BILLING_SUMMARY_KEY = "/api/billing/subscription";
/** After a successful checkout, webhooks may land a few seconds later: poll briefly. */
const POST_CHECKOUT_POLL_MS = 2_500;
const POST_CHECKOUT_POLL_FOR_MS = 30_000;

export interface BillingDashboardProps {
  initialSummary: BillingSummaryDTO;
  initialCredits: CreditsPage;
  notice: "success" | "canceled" | null;
  mockPortal: boolean;
  /** Plan / pack picked on the public pricing page before signing in (`?plan=&interval=` / `?pack=`). */
  checkoutIntent?: CheckoutItem | null;
}

export function BillingDashboard({
  initialSummary,
  initialCredits,
  notice,
  mockPortal,
  checkoutIntent,
}: BillingDashboardProps) {
  const router = useRouter();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [polling, setPolling] = React.useState(notice === "success");
  const [dismissed, setDismissed] = React.useState(false);
  const refreshInterval = polling ? POST_CHECKOUT_POLL_MS : 0;

  const { data: summary = initialSummary, mutate: mutateSummary } = useSWR<BillingSummaryDTO>(BILLING_SUMMARY_KEY, fetcher, {
    fallbackData: initialSummary,
    refreshInterval,
  });
  const { data: credits = initialCredits, mutate: mutateCredits } = useSWR<CreditsPage>(CREDITS_KEY, fetcher, {
    fallbackData: initialCredits,
    refreshInterval,
  });
  const { pending, openPortal } = useBillingActions();

  React.useEffect(() => {
    if (!polling) return;
    const stop = window.setTimeout(() => setPolling(false), POST_CHECKOUT_POLL_FOR_MS);
    return () => window.clearTimeout(stop);
  }, [polling]);

  // Keep the header credit badge in sync with the balance shown here.
  React.useEffect(() => {
    void mutateGlobal(ME_KEY);
  }, [credits.balance, summary.plan, mutateGlobal]);

  function dismissNotice() {
    setDismissed(true);
    router.replace("/app/billing", { scroll: false });
  }

  const refresh = React.useCallback(async () => {
    await Promise.all([mutateSummary(), mutateCredits()]);
  }, [mutateSummary, mutateCredits]);

  const isTestMode = summary.provider === "mock";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Billing" description="Your plan, credits and payments." />

      {notice && !dismissed && (
        <Alert role="status" variant={notice === "success" ? "success" : "default"} className="pr-12">
          {notice === "success" ? <CircleCheckIcon aria-hidden="true" /> : <InfoIcon aria-hidden="true" />}
          <AlertTitle>{notice === "success" ? "Payment received — thank you!" : "Checkout canceled"}</AlertTitle>
          <AlertDescription>
            {notice === "success"
              ? "Your credits and plan update automatically; it can take a few seconds. A receipt is on its way to your inbox."
              : "No payment was made. You can pick a plan or credit pack whenever you're ready."}
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={dismissNotice}
            aria-label="Dismiss"
            className="absolute top-2 right-2"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Alert>
      )}

      {isTestMode && (
        <Alert variant="brand">
          <FlaskConicalIcon aria-hidden="true" />
          <AlertTitle>Test mode</AlertTitle>
          <AlertDescription>Payments are simulated with a test checkout. No real money is charged.</AlertDescription>
        </Alert>
      )}

      {isTestMode && mockPortal && <MockPortalPanel summary={summary} onChanged={refresh} />}

      {checkoutIntent && (
        <CheckoutIntentDialog
          item={checkoutIntent}
          currentPlanId={summary.plan}
          // Offer it once: a reload or back-navigation shouldn't ask again.
          onDone={() => router.replace("/app/billing", { scroll: false })}
        />
      )}

      <section aria-label="Plan and credits" className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <CurrentPlanCard summary={summary} onManage={openPortal} managing={pending === "portal"} />
        <Card className="gap-4">
          <CardHeader className="gap-1.5">
            <CardDescription>Credit balance</CardDescription>
            <CardTitle as="p" className="flex items-center gap-2 text-4xl font-semibold tabular-nums">
              <CoinsIcon aria-hidden="true" className="size-7 text-primary" />
              <span aria-live="polite">{formatCredits(credits.balance)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {credits.balance < 0
              ? "Your balance is negative after a refund. Top up to keep creating."
              : "Pack credits never expire. Failed or blocked generations are refunded automatically."}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="buy-credits" className="flex flex-col gap-4">
        <div>
          <h2 id="buy-credits" className="text-lg font-semibold">
            Buy credits
          </h2>
          <p className="text-sm text-muted-foreground">One-time packs. No subscription needed.</p>
        </div>
        <CreditPackCards mode="app" />
      </section>

      <section aria-labelledby="plans" className="flex flex-col gap-4">
        <div>
          <h2 id="plans" className="text-lg font-semibold">
            Plans
          </h2>
          <p className="text-sm text-muted-foreground">Monthly credits, more models, bigger batches and API access.</p>
        </div>
        <PlanCards
          mode="app"
          currentPlanId={summary.plan}
          defaultInterval={summary.subscription?.interval === "year" ? "year" : "month"}
        />
      </section>

      <section aria-labelledby="credit-history" className="flex flex-col gap-4">
        <h2 id="credit-history" className="text-lg font-semibold">
          Credit history
        </h2>
        <CreditHistory firstPage={credits} />
      </section>
    </div>
  );
}

/** Stand-in for Stripe's customer portal in test mode. */
function MockPortalPanel({ summary, onChanged }: { summary: BillingSummaryDTO; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const sub = summary.subscription;
  const cancellable = sub && sub.status !== "canceled";

  async function cancel() {
    setBusy(true);
    try {
      await api("/api/billing/mock/cancel", { method: "POST" });
      toast.success("Subscription canceled (test mode).");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't cancel the subscription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-4 border-dashed">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base">Test billing portal</CardTitle>
        <CardDescription>
          With Stripe configured, “Manage billing” opens Stripe&apos;s customer portal (payment method, invoices,
          cancellation). In test mode you can cancel your subscription here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={cancel} disabled={!cancellable || busy} aria-busy={busy}>
          {busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          {cancellable ? "Cancel subscription now" : "No active subscription"}
        </Button>
      </CardContent>
    </Card>
  );
}
