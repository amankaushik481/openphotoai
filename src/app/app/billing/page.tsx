import type { Metadata } from "next";
import { BillingDashboard } from "@/components/billing";
import { parseCheckoutIntent } from "@/components/billing/checkout-intent";
import { CREDITS_PAGE_SIZE } from "@/components/billing/credit-history";
import { requireUserPage } from "@/server/auth/session";
import { getBillingSummary } from "@/server/billing";
import { listPaymentHistory } from "@/server/billing/payment-history";
import { getBalance, listLedger } from "@/server/credits/ledger";
import { ledgerJobTypes } from "@/server/credits/ledger-jobs";

export const metadata: Metadata = { title: "Billing" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage("/app/billing");
  const params = await searchParams;
  const [summary, balance, page, payments] = await Promise.all([
    getBillingSummary(user.id),
    getBalance(user.id),
    listLedger(user.id, { limit: CREDITS_PAGE_SIZE }),
    listPaymentHistory(user.id),
  ]);
  const jobTypes = await ledgerJobTypes(user.id, page.entries);
  const notice = params.success === "1" ? "success" : params.canceled === "1" ? "canceled" : null;

  return (
    <BillingDashboard
      initialSummary={summary}
      initialCredits={{ balance, ledger: page.entries, nextCursor: page.nextCursor, jobTypes }}
      initialPayments={payments}
      notice={notice}
      mockPortal={params.mockPortal === "1"}
      checkoutIntent={notice ? null : parseCheckoutIntent(params)}
    />
  );
}
