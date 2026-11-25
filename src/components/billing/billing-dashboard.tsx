"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { LoaderCircleIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
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
import { LabNotice } from "./lab-notice";
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
        <LabNotice label="Lab notice · test mode" title="Test mode" tone="danger" role="note">
          Payments are simulated with a test checkout. No real money is charged.
        </LabNotice>
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

      {/* The account statement: plan on the left, the balance as a big lab readout on the right. */}
      <section aria-label="Plan and credits" className="border border-foreground/20 bg-card">
        <p
          aria-hidden="true"
          className="flex justify-between gap-3 border-b border-dashed border-foreground/20 px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:px-6"
        >
          <span>OpenShoot lab · account statement</span>
          <span className="max-sm:hidden">{isTestMode ? "Test mode" : "Live"}</span>
        </p>
        <div className="grid lg:grid-cols-[3fr_2fr]">
          <CurrentPlanCard summary={summary} onManage={openPortal} managing={pending === "portal"} />
          <div className="flex flex-col gap-3 border-t border-foreground/15 p-4 sm:p-6 lg:border-t-0 lg:border-l">
            <p className="mono-caps text-muted-foreground">Credit balance</p>
            <p className="flex items-baseline gap-2 font-mono text-5xl leading-none font-medium tracking-tight tabular-nums sm:text-6xl">
              <span aria-live="polite">{formatCredits(credits.balance)}</span>
              <span aria-hidden="true" className="text-sm tracking-[0.16em] text-muted-foreground uppercase">
                cr
              </span>
            </p>
            {credits.balance < 0 ? (
              <p className="text-sm text-destructive">
                Your balance is below zero because a payment was refunded or disputed. New jobs are paused until you top
                up.
              </p>
            ) : (
              <p className="max-w-[46ch] text-sm text-muted-foreground">
                Credits never expire. Failed or blocked generations are refunded automatically.
              </p>
            )}
            <a href="#buy-credits" className="w-fit text-sm font-medium underline underline-offset-4">
              Buy credits
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="buy-credits" className="flex flex-col gap-5">
        <SectionHead
          folio="01"
          id="buy-credits"
          title="Buy credits"
          description="One-time packs. No subscription needed. Credits never expire."
        />
        <CreditPackCards mode="app" />
      </section>

      <section aria-labelledby="plans" className="flex flex-col gap-5">
        <SectionHead
          folio="02"
          id="plans"
          title="Plans"
          description="Monthly credits, more models, bigger batches and API access."
        />
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

      <section aria-labelledby="credit-history" className="flex flex-col gap-5">
        <SectionHead
          folio="03"
          id="credit-history"
          title="Credit history"
          description="Every credit in and out, with the reason. Dates are in your time zone."
        />
        <CreditHistory firstPage={credits} />
      </section>

      <section aria-labelledby="payments" className="flex flex-col gap-5">
        <SectionHead folio="04" id="payments" title="Payments & receipts" />
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

/** Editorial section heading: a mono folio number, the title in the serif, a plain line under it. */
function SectionHead({
  folio,
  id,
  title,
  description,
}: {
  folio: string;
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-foreground/80 pt-3">
      <p aria-hidden="true" className="mono-caps text-muted-foreground">
        No. {folio}
      </p>
      <h2 id={id} className="scroll-mt-20 font-display text-3xl leading-none tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description && <p className="max-w-[62ch] text-sm text-muted-foreground">{description}</p>}
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
    <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss">
      <XIcon aria-hidden="true" />
    </Button>
  );

  if (notice === "canceled" || !confirmation) {
    return (
      <LabNotice role="status" label="Lab notice · no charge" title="Checkout canceled" action={dismiss}>
        No payment was made. You can pick a plan or credit pack whenever you&apos;re ready.
      </LabNotice>
    );
  }

  if (confirmation.state === "confirmed") {
    const parts = [
      confirmation.credits > 0 ? `${formatCredits(confirmation.credits)} credits were added to your balance.` : null,
      confirmation.planChanged ? `You're now on ${planName}.` : null,
      "A receipt is on its way to your inbox.",
    ].filter(Boolean);
    return (
      <LabNotice
        role="status"
        tone="success"
        label="Lab notice · received"
        title="Payment received — thank you!"
        action={dismiss}
      >
        {parts.join(" ")}
      </LabNotice>
    );
  }

  if (confirmation.state === "delayed") {
    return (
      <LabNotice
        role="status"
        tone="warning"
        label="Lab notice · awaiting confirmation"
        title="Still waiting for the payment confirmation"
        action={dismiss}
      >
        <p>
          This is taking longer than usual. Don&apos;t pay again: your credits and plan appear here as soon as the
          payment provider confirms. If nothing changes within an hour, email {APP.supportEmail}.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onCheckAgain}>
          <RefreshCwIcon aria-hidden="true" />
          Check again
        </Button>
      </LabNotice>
    );
  }

  return (
    <LabNotice role="status" tone="working" label="Lab notice · confirming" title="Confirming your payment…" action={dismiss}>
      Thanks! We&apos;re waiting for the payment provider to confirm, which usually takes a few seconds (at most{" "}
      {Math.round(CONFIRM_FAST_FOR_MS / 1000)} s). Your credits and plan update here automatically.
    </LabNotice>
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
    <section aria-labelledby="test-portal" className="flex flex-col gap-3 border border-dashed border-foreground/30 p-4 sm:p-5">
      <p className="mono-caps text-safelight-ink">Test mode · stand-in</p>
      <h2 id="test-portal" className="font-display text-2xl leading-none">
        Test billing portal
      </h2>
      <p className="max-w-[68ch] text-sm text-muted-foreground">
        With Stripe configured, “Manage billing” opens Stripe&apos;s customer portal (payment method, invoices,
        cancellation). In test mode you can cancel your subscription here: it ends now and you move to Free; your credits
        stay.
      </p>
      <Button variant="destructive" onClick={cancel} disabled={!cancellable || busy} aria-busy={busy} className="self-start">
        {busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
        {cancellable ? "Cancel subscription now" : "No active subscription"}
      </Button>
    </section>
  );
}
