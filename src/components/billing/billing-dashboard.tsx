"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  CircleCheckIcon,
  ClockIcon,
  CoinsIcon,
  FlaskConicalIcon,
  InfoIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { getPlan } from "@/config/plans";
import { ME_KEY } from "@/hooks/use-me";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import type { CheckoutItem } from "@/providers/types";
import type { PaymentHistoryItemDTO } from "@/server/billing/payment-history";
import type { BillingSummaryDTO } from "@/server/billing/types";
import { CheckoutIntentDialog } from "./checkout-intent-dialog";
import { checkoutConfirmation, CONFIRM_FAST_FOR_MS, type CheckoutConfirmation } from "./checkout-status";
import { CreditHistory, CREDITS_KEY, type CreditsPage } from "./credit-history";
import { CreditPackCards } from "./credit-pack-cards";
import { CurrentPlanCard } from "./current-plan-card";
import { formatCredits } from "./format";
import { PaymentHistory } from "./payment-history";
import { PlanCards, type PlanCheckoutItem } from "./plan-cards";
import { PlanChangeDialog } from "./plan-change-dialog";
import { startBillingRedirect, useBillingActions } from "./use-billing-actions";

export const BILLING_SUMMARY_KEY = "/api/billing/subscription";
/** While a checkout is unconfirmed: poll quickly, then slowly (webhooks can be minutes late). */
const POLL_FAST_MS = 2_500;
const POLL_SLOW_MS = 15_000;
/** Stop polling a late confirmation after this long (the user can still check again by hand). */
const POLL_GIVE_UP_MS = 10 * 60_000;

export interface BillingDashboardProps {
  initialSummary: BillingSummaryDTO;
  initialCredits: CreditsPage;
  /** Newest payments (refunds and chargebacks included). */
  initialPayments?: PaymentHistoryItemDTO[];
  notice: "success" | "canceled" | null;
  mockPortal: boolean;
  /** Plan / pack picked on the public pricing page before signing in (`?plan=&interval=` / `?pack=`). */
  checkoutIntent?: CheckoutItem | null;
  /** When the checkout being confirmed was created (from the success URL), if known. */
  checkoutSince?: number | null;
}

export function BillingDashboard({
  initialSummary,
  initialCredits,
  initialPayments = [],
  notice,
  mockPortal,
  checkoutIntent,
  checkoutSince = null,
}: BillingDashboardProps) {
  const router = useRouter();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [dismissed, setDismissed] = React.useState(false);
  // When the page opened (the checkout return); reset by "Check again".
  const [openedAt, setOpenedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(openedAt);
  const [changing, setChanging] = React.useState<PlanCheckoutItem | null>(null);

  const awaiting = notice === "success";
  // The plan when the checkout returned (a server refresh later updates `initialSummary`).
  const [initialPlan] = React.useState(initialSummary.plan);

  const { data: summary = initialSummary, mutate: mutateSummary } = useSWR<BillingSummaryDTO>(
    BILLING_SUMMARY_KEY,
    fetcher,
    {
      fallbackData: initialSummary,
    },
  );
  const { data: credits = initialCredits, mutate: mutateCredits } = useSWR<CreditsPage>(CREDITS_KEY, fetcher, {
    fallbackData: initialCredits,
  });
  const { pending, openPortal } = useBillingActions();

  // Derived on every render (first render included, so a webhook that already arrived shows "received").
  const confirmation: CheckoutConfirmation | null = awaiting
    ? checkoutConfirmation({
        ledger: credits.ledger,
        plan: summary.plan,
        initialPlan,
        openedAt,
        now,
        since: checkoutSince,
      })
    : null;
  const confirmed = confirmation?.state === "confirmed";
  const polling = awaiting && !confirmed && now - openedAt < POLL_GIVE_UP_MS;
  const pollMs = polling ? (confirmation?.state === "delayed" ? POLL_SLOW_MS : POLL_FAST_MS) : 0;
  // Polling hooks share the cache with the two above (their data is what decides when to stop).
  usePoll(BILLING_SUMMARY_KEY, pollMs);
  usePoll(CREDITS_KEY, pollMs);

  // Confirmed while the page was open: reload the server parts too (payments list).
  const confirmedOnLoad = React.useRef(confirmed);
  React.useEffect(() => {
    if (confirmed && !confirmedOnLoad.current) {
      confirmedOnLoad.current = true;
      router.refresh();
    }
  }, [confirmed, router]);

  React.useEffect(() => {
    if (!polling) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(tick);
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

  function checkAgain() {
    const t = Date.now();
    setOpenedAt(t);
    setNow(t);
    void refresh();
  }

  const isTestMode = summary.provider === "mock";
  const liveSubscription =
    summary.subscription && summary.subscription.status !== "canceled" && summary.subscription.planId === summary.plan
      ? summary.subscription
      : null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Billing" description="Your plan, credits and payments." />

      {notice && !dismissed && (
        <CheckoutNotice
          notice={notice}
          confirmation={confirmation}
          planName={getPlan(summary.plan).name}
          onDismiss={dismissNotice}
          onCheckAgain={checkAgain}
        />
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
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            {credits.balance < 0 ? (
              <p className="text-destructive">
                Your balance is below zero because a payment was refunded or disputed. New jobs are paused until you top
                up.
              </p>
            ) : (
              <p>Credits never expire. Failed or blocked generations are refunded automatically.</p>
            )}
            <a href="#buy-credits" className="font-medium text-primary underline-offset-4 hover:underline">
              Buy credits
            </a>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="buy-credits" className="flex flex-col gap-4">
        <div>
          <h2 id="buy-credits" className="scroll-mt-20 text-lg font-semibold">
            Buy credits
          </h2>
          <p className="text-sm text-muted-foreground">One-time packs. No subscription needed. Credits never expire.</p>
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
          // Replacing a live subscription: spell out what happens before the checkout starts.
          onChoose={liveSubscription ? (item) => setChanging(item) : undefined}
        />
      </section>

      {liveSubscription && (
        <PlanChangeDialog
          item={changing}
          current={liveSubscription}
          balance={credits.balance}
          onOpenChange={(open) => !open && setChanging(null)}
          onConfirm={async (item) => {
            await startBillingRedirect(
              `plan:${item.planId}:${item.interval}`,
              () => api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { item } }),
              {
                navigate: (url) => window.location.assign(url),
                onError: (err) => {
                  throw err; // the dialog shows the error and stays open
                },
              },
            );
          }}
        />
      )}

      <section aria-labelledby="credit-history" className="flex flex-col gap-4">
        <div>
          <h2 id="credit-history" className="text-lg font-semibold">
            Credit history
          </h2>
          <p className="text-sm text-muted-foreground">
            Every credit in and out, with the reason. Dates are in your time zone.
          </p>
        </div>
        <CreditHistory firstPage={credits} />
      </section>

      <section aria-labelledby="payments" className="flex flex-col gap-4">
        <h2 id="payments" className="text-lg font-semibold">
          Payments &amp; receipts
        </h2>
        <PaymentHistory
          payments={initialPayments}
          canManageBilling={summary.canManageBilling}
          testMode={isTestMode}
          onOpenPortal={openPortal}
          openingPortal={pending === "portal"}
        />
      </section>
    </div>
  );
}

/** Re-fetch `key` every `ms` (0 = off) into the shared SWR cache. */
function usePoll(key: string, ms: number) {
  useSWR(ms > 0 ? key : null, fetcher, { refreshInterval: ms, revalidateOnFocus: false });
}

function CheckoutNotice({
  notice,
  confirmation,
  planName,
  onDismiss,
  onCheckAgain,
}: {
  notice: "success" | "canceled";
  confirmation: CheckoutConfirmation | null;
  planName: string;
  onDismiss: () => void;
  onCheckAgain: () => void;
}) {
  const dismiss = (
    <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss" className="absolute top-2 right-2">
      <XIcon aria-hidden="true" />
    </Button>
  );

  if (notice === "canceled" || !confirmation) {
    return (
      <Alert role="status" className="pr-12">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>Checkout canceled</AlertTitle>
        <AlertDescription>
          No payment was made. You can pick a plan or credit pack whenever you&apos;re ready.
        </AlertDescription>
        {dismiss}
      </Alert>
    );
  }

  if (confirmation.state === "confirmed") {
    const parts = [
      confirmation.credits > 0 ? `${formatCredits(confirmation.credits)} credits were added to your balance.` : null,
      confirmation.planChanged ? `You're now on ${planName}.` : null,
      "A receipt is on its way to your inbox.",
    ].filter(Boolean);
    return (
      <Alert role="status" variant="success" className="pr-12">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle>Payment received — thank you!</AlertTitle>
        <AlertDescription>{parts.join(" ")}</AlertDescription>
        {dismiss}
      </Alert>
    );
  }

  if (confirmation.state === "delayed") {
    return (
      <Alert role="status" variant="warning" className="pr-12">
        <ClockIcon aria-hidden="true" />
        <AlertTitle>Still waiting for the payment confirmation</AlertTitle>
        <AlertDescription>
          <p>
            This is taking longer than usual. Don&apos;t pay again: your credits and plan appear here as soon as the
            payment provider confirms. If nothing changes within an hour, email {APP.supportEmail}.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onCheckAgain}>
            <RefreshCwIcon aria-hidden="true" />
            Check again
          </Button>
        </AlertDescription>
        {dismiss}
      </Alert>
    );
  }

  return (
    <Alert role="status" variant="brand" className="pr-12">
      <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
      <AlertTitle>Confirming your payment…</AlertTitle>
      <AlertDescription>
        Thanks! We&apos;re waiting for the payment provider to confirm, which usually takes a few seconds (at most{" "}
        {Math.round(CONFIRM_FAST_FOR_MS / 1000)} s). Your credits and plan update here automatically.
      </AlertDescription>
      {dismiss}
    </Alert>
  );
}

/** Stand-in for Stripe's customer portal in test mode. */
function MockPortalPanel({ summary, onChanged }: { summary: BillingSummaryDTO; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const sub = summary.subscription;
  const cancellable = sub && sub.status !== "canceled";

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/billing/mock/cancel", { method: "POST" });
      toast.success("Subscription canceled (test mode).");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't cancel the subscription. Try again.");
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
          cancellation). In test mode you can cancel your subscription here: it ends now and you move to Free; your
          credits stay.
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
