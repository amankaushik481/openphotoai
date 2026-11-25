/**
 * Billing page regressions (GM-D): time-zone-stable dates, the checkout return before the webhook,
 * double-click purchases, readable ledger rows and the payments list.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingDashboard } from "@/components/billing";
import { checkoutConfirmation, CONFIRM_FAST_FOR_MS, RECENT_PAYMENT_MS } from "@/components/billing/checkout-status";
import { CreditHistory, describeLedgerEntry } from "@/components/billing/credit-history";
import { CurrentPlanCard } from "@/components/billing/current-plan-card";
import { formatCreditDelta, formatMoney, formatPerCredit } from "@/components/billing/format";
import { lostFeatures } from "@/components/billing/plan-change";
import { pendingBillingRedirect, resetBillingRedirect, startBillingRedirect } from "@/components/billing/use-billing-actions";
import { listPaymentHistory, paymentProductLabel } from "@/server/billing/payment-history";
import type { BillingSummaryDTO } from "@/server/billing/types";
import { ledgerJobTypes } from "@/server/credits/ledger-jobs";
import type { CreditLedgerEntryDTO } from "@/types/domain";
import { createPayment } from "../admin/fixtures";
import { createTestDb, createTestJob, createTestUser } from "../../helpers/factories";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const summary = (over: Partial<BillingSummaryDTO> = {}): BillingSummaryDTO => ({
  subscription: null,
  plan: "free",
  hasPaid: false,
  canManageBilling: false,
  provider: "mock",
  ...over,
});

const entry = (over: Partial<CreditLedgerEntryDTO> = {}): CreditLedgerEntryDTO => ({
  id: "crd_1",
  delta: 500,
  balanceAfter: 500,
  reason: "purchase",
  jobId: null,
  note: null,
  createdAt: "2026-11-25T03:00:00.000Z",
  ...over,
});

describe("dates render the same on the server whatever its time zone (no hydration mismatch)", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("the credit history shows the UTC day on the server, in Los Angeles and in Tokyo", () => {
    // 03:00 UTC on Nov 25 is still Nov 24 in Los Angeles: the server render must not depend on that.
    for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = tz;
      const html = renderToStaticMarkup(<CreditHistory firstPage={{ balance: 500, ledger: [entry()], nextCursor: null }} />);
      expect(html).toContain("Nov 25, 2026");
      expect(html).toContain('dateTime="2026-11-25T03:00:00.000Z"');
    }
  });

  it("so does the renewal date", () => {
    process.env.TZ = "America/Los_Angeles";
    const html = renderToStaticMarkup(
      <CurrentPlanCard
        managing={false}
        onManage={() => undefined}
        summary={summary({
          plan: "pro",
          subscription: {
            id: "sub_1",
            planId: "pro",
            interval: "month",
            status: "active",
            currentPeriodEnd: "2026-12-25T01:00:00.000Z",
            cancelAtPeriodEnd: false,
            provider: "mock",
          },
        })}
      />,
    );
    expect(html).toContain("Dec 25, 2026");
  });
});

describe("checkout return before the payment webhook", () => {
  const openedAt = Date.parse("2026-11-25T12:00:00.000Z");
  const base = { plan: "free" as const, initialPlan: "free" as const, openedAt };

  it("is 'confirming' until a fresh purchase (or plan change) shows up, then 'confirmed' with the credits", () => {
    const old = entry({ createdAt: new Date(openedAt - RECENT_PAYMENT_MS - 1000).toISOString() });
    expect(checkoutConfirmation({ ...base, ledger: [old], now: openedAt + 1000 })).toEqual({ state: "confirming" });
    expect(checkoutConfirmation({ ...base, ledger: [old], now: openedAt + CONFIRM_FAST_FOR_MS })).toEqual({ state: "delayed" });

    const fresh = entry({ id: "crd_2", delta: 100, createdAt: new Date(openedAt + 5_000).toISOString() });
    expect(checkoutConfirmation({ ...base, ledger: [fresh, old], now: openedAt + 6_000 })).toEqual({
      state: "confirmed",
      credits: 100,
      planChanged: false,
    });
    // A webhook processed just before the redirect landed is this checkout's too.
    const justBefore = entry({ createdAt: new Date(openedAt - 3_000).toISOString(), reason: "subscription_grant", delta: 600 });
    expect(checkoutConfirmation({ ...base, ledger: [justBefore], now: openedAt })).toMatchObject({ state: "confirmed", credits: 600 });
    // A plan start without credits (100% coupon) still confirms through the plan change.
    expect(checkoutConfirmation({ ...base, plan: "pro", ledger: [], now: openedAt + 1000 })).toEqual({
      state: "confirmed",
      credits: 0,
      planChanged: true,
    });
    // Spending isn't a payment.
    const spent = entry({ reason: "job_debit", delta: -4, createdAt: new Date(openedAt).toISOString() });
    expect(checkoutConfirmation({ ...base, ledger: [spent], now: openedAt + 1000 }).state).toBe("confirming");
  });

  it("the dashboard says 'confirming' (not 'payment received') when the webhook hasn't arrived", () => {
    const html = renderToStaticMarkup(
      <BillingDashboard
        initialSummary={summary()}
        initialCredits={{ balance: 0, ledger: [], nextCursor: null }}
        notice="success"
        mockPortal={false}
      />,
    );
    expect(html).toContain("Confirming your payment");
    expect(html).not.toContain("Payment received");
  });

  it("and 'payment received' with the credits once it has", () => {
    const html = renderToStaticMarkup(
      <BillingDashboard
        initialSummary={summary()}
        initialCredits={{ balance: 100, ledger: [entry({ delta: 100, createdAt: new Date().toISOString() })], nextCursor: null }}
        notice="success"
        mockPortal={false}
      />,
    );
    expect(html).toContain("Payment received — thank you!");
    expect(html).toContain("100 credits were added to your balance.");
  });
});

describe("double-click purchase", () => {
  beforeEach(() => resetBillingRedirect());

  it("starts one checkout while another is being created, across every buy button", async () => {
    let resolve!: (v: { url: string }) => void;
    const request = vi.fn(() => new Promise<{ url: string }>((r) => (resolve = r)));
    const navigate = vi.fn();
    const deps = { navigate, onError: vi.fn() };

    const first = startBillingRedirect("pack:credits_100", request, deps);
    const second = startBillingRedirect("pack:credits_100", request, deps);
    const otherCard = startBillingRedirect("plan:pro:month", request, deps);
    expect(await second).toBe(false);
    expect(await otherCard).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(pendingBillingRedirect()).toBe("pack:credits_100");

    resolve({ url: "/billing/mock-checkout?session=x" });
    expect(await first).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("a failed start frees the buttons again", async () => {
    const onError = vi.fn();
    const failing = vi.fn(async () => {
      throw new Error("provider down");
    });
    expect(await startBillingRedirect("portal", failing, { navigate: vi.fn(), onError })).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(pendingBillingRedirect()).toBeNull();
    const ok = vi.fn(async () => ({ url: "/x" }));
    expect(await startBillingRedirect("portal", ok, { navigate: vi.fn(), onError })).toBe(true);
  });
});

describe("readable ledger and money formatting", () => {
  it("names the job behind a debit or refund", () => {
    const jobTypes = { job_1: "generate" as const };
    expect(describeLedgerEntry({ reason: "job_debit", jobId: "job_1", note: null }, jobTypes)).toEqual({
      title: "Photo generation",
      detail: null,
    });
    expect(describeLedgerEntry({ reason: "job_refund", jobId: "job_1", note: "Job failed" }, jobTypes)).toEqual({
      title: "Refund",
      detail: "Photo generation · Job failed",
    });
    expect(describeLedgerEntry({ reason: "job_debit", jobId: "job_unknown", note: null }).title).toBe("Used for a job");
    expect(describeLedgerEntry({ reason: "transfer_in", jobId: null, note: "From Acme" })).toEqual({
      title: "Received from your team",
      detail: "From Acme",
    });
  });

  it("formats deltas, per-credit prices and refunds without rounding artifacts", () => {
    expect(formatCreditDelta(500)).toBe("+500");
    expect(formatCreditDelta(-1500)).toBe("−1,500");
    expect(formatCreditDelta(0)).toBe("0");
    expect(formatPerCredit(900, 100)).toBe("9¢");
    expect(formatPerCredit(3900, 500)).toBe("7.8¢");
    expect(formatPerCredit(9900, 1500)).toBe("6.6¢");
    expect(formatMoney(-900)).toBe("−$9.00");
    expect(formatMoney(3250, "eur")).toBe("€32.50");
  });

  it("lists what a downgrade takes away", () => {
    expect(lostFeatures("pro", "studio")).toEqual([]);
    const lost = lostFeatures("studio", "starter").join(" ");
    expect(lost).toContain("API access");
    expect(lost).toContain("Team seats");
    expect(lost).toContain("up to 2 instead of 20");
  });
});

describe("payments list and ledger job types (database)", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  it("lists the user's payments with refunds and chargebacks, newest first, and nobody else's", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    await createPayment(u.id, { providerPaymentId: "cs_1", createdAt: new Date("2026-11-01T00:00:00Z") });
    await createPayment(u.id, {
      providerPaymentId: "cs_1:refund:evt_1",
      amountCents: -900,
      credits: -100,
      status: "refunded",
      createdAt: new Date("2026-11-02T00:00:00Z"),
    });
    await createPayment(u.id, {
      providerPaymentId: "in_1",
      kind: "subscription",
      productId: "pro_month",
      amountCents: 3900,
      credits: 600,
      createdAt: new Date("2026-11-03T00:00:00Z"),
    });
    await createPayment(other.id, { providerPaymentId: "cs_other" });

    const list = await listPaymentHistory(u.id);
    expect(list.map((p) => [p.type, p.description, p.amountCents])).toEqual([
      ["payment", "Pro plan (monthly)", 3900],
      ["refund", "100 credits credit pack", -900],
      ["payment", "100 credits credit pack", 900],
    ]);
    expect(paymentProductLabel("legacy_thing")).toBe("legacy_thing");
  });

  it("maps ledger job ids to job types, only for the user's own jobs", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    const mine = await createTestJob(u.id, { type: "upscale" });
    const theirs = await createTestJob(other.id, { type: "video" });
    const types = await ledgerJobTypes(u.id, [
      entry({ jobId: mine.id, reason: "job_debit" }),
      entry({ id: "crd_2", jobId: theirs.id, reason: "job_debit" }),
      entry({ id: "crd_3" }),
    ]);
    expect(types).toEqual({ [mine.id]: "upscale" });
  });
});
