import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingDashboard, CreditPackCards, MockCheckoutCard, PlanCards } from "@/components/billing";
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
  it("PlanCards in public mode link every plan to sign-in", () => {
    const html = renderToStaticMarkup(<PlanCards mode="public" />);
    for (const name of ["Free", "Starter", "Pro", "Studio"]) expect(html).toContain(name);
    expect(html.match(/href="\/login\?next=\/app\/billing"/g)).toHaveLength(4);
    expect(html).toContain("2 months free");
    expect(html).toContain("$39");
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
    expect(pub.match(/href="\/login\?next=\/app\/billing"/g)).toHaveLength(3);
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
