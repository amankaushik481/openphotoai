import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BillingDashboard,
  checkoutIntentPath,
  CreditPackCards,
  MockCheckoutCard,
  parseCheckoutIntent,
  PlanCards,
  publicCheckoutHref,
} from "@/components/billing";
import { minYearlyMonthsFree, PLANS, yearlyMonthsFree } from "@/config/plans";
import { safeNextPath } from "@/server/auth/redirect";
import type { BillingSummaryDTO } from "@/server/billing/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const summary = (over: Partial<BillingSummaryDTO> = {}): BillingSummaryDTO => ({
  subscription: null,
  plan: "free",
  hasPaid: false,
  canManageBilling: false,
  provider: "mock",
  ...over,
});

describe("billing components (server render)", () => {
  it("PlanCards in public mode link every plan to sign-in, paid plans continuing to checkout", () => {
    const html = renderToStaticMarkup(<PlanCards mode="public" />);
    for (const name of ["Free", "Starter", "Pro", "Studio"]) expect(html).toContain(name);
    expect(html).toContain('href="/login"');
    for (const id of ["starter", "pro", "studio"]) {
      const next = encodeURIComponent(`/app/billing?plan=${id}&interval=month`);
      expect(html).toContain(`href="/login?next=${next.replace(/&/g, "&amp;")}"`);
    }
    expect(html).toContain(`${minYearlyMonthsFree()} months free`);
    expect(html).toContain("$39");
    const yearly = renderToStaticMarkup(<PlanCards mode="public" defaultInterval="year" />);
    expect(yearly).toContain(encodeURIComponent("/app/billing?plan=pro&interval=year"));
  });

  it("derives the yearly badge from plan prices", () => {
    expect(yearlyMonthsFree({ ...PLANS.pro, monthlyPriceCents: 1000, yearlyPriceCents: 10_000 })).toBe(2);
    expect(yearlyMonthsFree({ ...PLANS.pro, monthlyPriceCents: 1000, yearlyPriceCents: 9_000 })).toBe(3);
    expect(yearlyMonthsFree({ ...PLANS.pro, monthlyPriceCents: 1000, yearlyPriceCents: 12_000 })).toBe(0);
    expect(yearlyMonthsFree(PLANS.free)).toBe(0);
    expect(minYearlyMonthsFree()).toBe(2);
  });

  it("checkout intents round-trip through /login?next= and ignore unknown ids", () => {
    const plan = { type: "plan", planId: "pro", interval: "year" } as const;
    expect(checkoutIntentPath(plan)).toBe("/app/billing?plan=pro&interval=year");
    expect(publicCheckoutHref(plan)).toBe(`/login?next=${encodeURIComponent("/app/billing?plan=pro&interval=year")}`);
    expect(safeNextPath(new URL(`http://x${publicCheckoutHref(plan)}`).searchParams.get("next"))).toBe(checkoutIntentPath(plan));
    expect(parseCheckoutIntent({ plan: "pro", interval: "year" })).toEqual(plan);
    expect(parseCheckoutIntent({ plan: "starter" })).toEqual({ type: "plan", planId: "starter", interval: "month" });
    expect(parseCheckoutIntent({ pack: "credits_500" })).toEqual({ type: "credit_pack", packId: "credits_500" });
    expect(parseCheckoutIntent({ plan: "free" })).toBeNull();
    expect(parseCheckoutIntent({ plan: "enterprise" })).toBeNull();
    expect(parseCheckoutIntent({ pack: "credits_9999" })).toBeNull();
    expect(parseCheckoutIntent({})).toBeNull();
  });

  it("PlanCards in app mode mark the current plan and offer upgrades with yearly prices", () => {
    const html = renderToStaticMarkup(<PlanCards mode="app" currentPlanId="starter" defaultInterval="year" />);
    expect(html).not.toContain(">Free<");
    expect(html).toContain("Current plan");
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain("$390 billed yearly");
    expect(html).toContain("$32.50");
  });

  it("CreditPackCards render every pack in both modes", () => {
    const app = renderToStaticMarkup(<CreditPackCards mode="app" />);
    expect(app).toContain("Buy for $9");
    expect(app).toContain("Buy for $39");
    expect(app).toContain("Buy for $99");
    const pub = renderToStaticMarkup(<CreditPackCards mode="public" />);
    for (const id of ["credits_100", "credits_500", "credits_1500"]) {
      expect(pub).toContain(`href="/login?next=${encodeURIComponent(`/app/billing?pack=${id}`)}"`);
    }
  });

  it("MockCheckoutCard is clearly labeled as a test payment", () => {
    const html = renderToStaticMarkup(
      <MockCheckoutCard
        checkoutId="mcs_x"
        email="jane@example.com"
        item={{ name: "Pro plan (monthly)", description: "For creators", priceCents: 3900, credits: 600, interval: "month" }}
      />,
    );
    expect(html).toContain("Test checkout — no real payment");
    expect(html).toContain("Pay $39");
    expect(html).toContain('href="/app/billing?canceled=1"');
  });

  it("BillingDashboard renders plan, balance, notices and history", () => {
    const html = renderToStaticMarkup(
      <BillingDashboard
        initialSummary={summary({
          plan: "pro",
          hasPaid: true,
          canManageBilling: true,
          subscription: {
            id: "sub_1",
            planId: "pro",
            interval: "month",
            status: "active",
            currentPeriodEnd: "2026-12-01T00:00:00.000Z",
            cancelAtPeriodEnd: true,
            provider: "mock",
          },
        })}
        initialCredits={{
          balance: 1234,
          nextCursor: "crd_2",
          ledger: [
            { id: "crd_1", delta: 600, balanceAfter: 1234, reason: "subscription_grant", jobId: null, note: "Pro plan (monthly)", createdAt: "2026-11-01T00:00:00.000Z" },
          ],
        }}
        notice="success"
        mockPortal
      />,
    );
    expect(html).toContain("Payment received");
    expect(html).toContain("Test mode");
    expect(html).toContain("Test billing portal");
    expect(html).toContain("1,234");
    expect(html).toContain("Ends on");
    expect(html).toContain("Manage billing");
    expect(html).toContain("Plan credits");
    expect(html).toContain("Load more");
  });

  it("BillingDashboard shows the empty history state for new users", () => {
    const html = renderToStaticMarkup(
      <BillingDashboard initialSummary={summary()} initialCredits={{ balance: 0, ledger: [], nextCursor: null }} notice={null} mockPortal={false} />,
    );
    expect(html).toContain("No credit activity yet");
    expect(html).not.toContain("Manage billing");
  });
});

describe("BillingDashboard checkout intent", () => {
  it("renders with a pending plan / pack intent (the dialog itself is portaled on the client)", () => {
    const credits = { balance: 0, nextCursor: null, ledger: [] };
    for (const intent of [
      { type: "plan", planId: "pro", interval: "year" } as const,
      { type: "credit_pack", packId: "credits_500" } as const,
    ]) {
      const html = renderToStaticMarkup(
        <BillingDashboard initialSummary={summary()} initialCredits={credits} notice={null} mockPortal={false} checkoutIntent={intent} />,
      );
      expect(html).toContain("Buy credits");
    }
  });
});
