import type { Metadata } from "next";
import Link from "next/link";

import { CreditCostTable } from "@/components/marketing/credit-cost-table";
import { CreditExamples } from "@/components/marketing/credit-examples";
import { EdgeRule, FaqEntries, Masthead, PAGE, Readout, SectionHead } from "@/components/marketing/editorial";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { PlanComparison } from "@/components/marketing/plan-comparison";
import { CreditPackBoard, PlanBoard } from "@/components/marketing/plan-board";
import { ProviderCostNote } from "@/components/marketing/provider-cost-note";
import { APP } from "@/config/app";
import { DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { PLANS } from "@/config/plans";
import { pricingFaqItems } from "@/content/faq";
import { getLegalVariables } from "@/content/legal";
import { marketingMetadata } from "@/content/site";
import { buildBreadcrumbJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = marketingMetadata({
  title: "Pricing",
  description: `Honest pricing for ${APP.name}: credits that never expire, automatic refunds for failed or low-likeness photos, every action's cost shown up front, cancel in one click. Plans from free.`,
  path: "/pricing",
});

const textLink =
  "font-medium text-foreground underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink";

function Section({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn(PAGE, "pt-20 sm:pt-28", className)}>
      {children}
    </section>
  );
}

export default function PricingPage() {
  const legal = getLegalVariables();
  const hasFootnote = Object.values(PLANS).some((p) => p.highlights.some((h) => h.endsWith("*")));
  const promises = [
    "Credit-pack credits never expire",
    "Failed and low-likeness shots refunded automatically",
    `Unused purchases refundable for ${legal.refundWindowDays} days`,
    "Cancel in one click",
  ];

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ])}
      />
      <Masthead
        section="Price board"
        meta="Prices in USD"
        titleId="pricing-title"
        title={
          <>
            Honest pricing. <em className="italic">No fine print.</em>
          </>
        }
        lead="Pay monthly if you shoot often, or buy credits once and keep them forever. Every action shows its cost before you click, and anything that goes wrong is refunded automatically."
      />
      <div className={cn(PAGE, "mt-10 sm:mt-12")}>
        <Readout items={promises} />
      </div>

      <section aria-label="Plans" className={cn(PAGE, "pt-14 sm:pt-20")}>
        <PlanBoard />
        <div className="mt-4 flex flex-col gap-2 font-mono text-xs leading-relaxed text-muted-foreground lg:flex-row lg:justify-between lg:gap-8">
          <p className="max-w-[68ch]">
            Credits never expire, from plans or packs. Taxes may apply at checkout. Commercial use included on paid
            plans.
            {hasFootnote && (
              <>
                {" "}
                * Draft previews cost 0 credits and are capped at {DRAFT_DAILY_LIMIT_FREE} a day before your first
                purchase, {DRAFT_DAILY_LIMIT} a day after.
              </>
            )}
          </p>
          <a href="#compare" className={cn(textLink, "shrink-0 font-sans text-sm")}>
            Compare every limit
          </a>
        </div>
      </section>

      <Section id="compare-title">
        <div id="compare" className="scroll-mt-24">
          <SectionHead
            id="compare-title"
            no={2}
            label="Spec sheet"
            title="Every plan, side by side"
            lead="The same tools and the same likeness guarantee on every plan. Paid plans add monthly credits and higher limits."
          />
        </div>
        <div className="mt-8 lg:ml-[calc(25%+0.625rem)]">
          <PlanComparison />
        </div>
      </Section>

      <Section id="packs-title">
        <SectionHead
          id="packs-title"
          no={3}
          label="Pay as you go"
          title="One-time credit packs"
          lead="No subscription. Top up whenever you like; these credits never expire."
        />
        <CreditPackBoard className="mt-8 lg:ml-[calc(25%+0.625rem)]" />
      </Section>

      <Section id="costs-title">
        <div id="credit-costs" className="scroll-mt-24">
          <SectionHead
            id="costs-title"
            no={4}
            label="Price list"
            title="What everything costs"
            lead="One credit is roughly one standard photo. Every price here comes from the same config the app charges from."
          />
        </div>
        <div className="mt-10 flex flex-col gap-14 lg:ml-[calc(25%+0.625rem)]">
          <CreditExamples />
          <CreditCostTable />
        </div>
        <EdgeRule frame="24" className="my-14" />
        <ProviderCostNote />
      </Section>

      <Section id="pricing-faq-title" className="pb-20 sm:pb-28">
        <SectionHead id="pricing-faq-title" no={5} label="Billing FAQ" title="Refunds, guarantees and the rest" />
        <div className="mt-8 lg:ml-[calc(25%+0.625rem)]">
          <FaqEntries items={pricingFaqItems()} />
          <p className="mt-6 text-sm text-muted-foreground">
            More answers in the{" "}
            <Link href="/faq" className={textLink}>
              FAQ
            </Link>{" "}
            and the{" "}
            <Link href="/legal/terms#refunds" className={textLink}>
              refund terms
            </Link>
            .
          </p>
        </div>
      </Section>

      <FinalCta title="Start free. Pay when it's worth it." />
    </>
  );
}
