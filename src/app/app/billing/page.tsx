import type { Metadata } from "next";
import { BillingDashboard } from "@/components/billing";
import { CREDITS_PAGE_SIZE } from "@/components/billing/credit-history";
import { requireUserPage } from "@/server/auth/session";
import { getBillingSummary } from "@/server/billing";
import { getBalance, listLedger } from "@/server/credits/ledger";

export const metadata: Metadata = { title: "Billing" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage("/app/billing");
  const params = await searchParams;
  const [summary, balance, page] = await Promise.all([
    getBillingSummary(user.id),
    getBalance(user.id),
    listLedger(user.id, { limit: CREDITS_PAGE_SIZE }),
  ]);
  const notice = params.success === "1" ? "success" : params.canceled === "1" ? "canceled" : null;

  return (
    <BillingDashboard
      initialSummary={summary}
      initialCredits={{ balance, ledger: page.entries, nextCursor: page.nextCursor }}
      notice={notice}
      mockPortal={params.mockPortal === "1"}
    />
  );
}
