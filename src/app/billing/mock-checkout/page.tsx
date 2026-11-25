import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MockCheckoutCard, type MockCheckoutItemView } from "@/components/billing";
import { LabNotice } from "@/components/billing/lab-notice";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { requireUserPage } from "@/server/auth/session";
import { loadMockCheckout } from "@/server/billing";
import { AppError } from "@/server/http";

export const metadata: Metadata = {
  title: "Test checkout",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Test-mode stand-in for Stripe Checkout (PAYMENT_PROVIDER=mock only). */
export default async function MockCheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  // Await request data first so this page is always rendered per request (never prerendered).
  const { session } = await searchParams;
  if (!env.mockCheckoutEnabled) notFound();
  const checkoutId = typeof session === "string" ? session : "";
  const user = await requireUserPage(`/billing/mock-checkout?session=${encodeURIComponent(checkoutId)}`);

  let view: MockCheckoutItemView | null = null;
  let problem = "This checkout link is missing its session.";
  if (checkoutId) {
    try {
      const { item } = loadMockCheckout(user.id, checkoutId);
      view = {
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        credits: item.credits,
        interval: item.item.type === "plan" ? item.item.interval : undefined,
      };
    } catch (err) {
      problem = err instanceof AppError ? err.message : "This checkout link is invalid.";
    }
  }

  return (
    <main id="main" className="grain flex min-h-dvh items-center justify-center bg-secondary px-4 py-10">
      {view ? (
        <MockCheckoutCard checkoutId={checkoutId} item={view} email={user.email} />
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          <LabNotice tone="danger" label="Lab notice · no order" title="Checkout unavailable" titleAs="h1">
            {problem}
          </LabNotice>
          <Button asChild variant="outline" className="self-start">
            <Link href="/app/billing">Back to billing</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
