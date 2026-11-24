import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheckIcon, InfinityIcon, MousePointerClickIcon, Undo2Icon } from "lucide-react";

import { CreditPackCards } from "@/components/billing/credit-pack-cards";
import { PlanCards } from "@/components/billing/plan-cards";
import { CreditCostTable } from "@/components/marketing/credit-cost-table";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { ProviderCostNote } from "@/components/marketing/provider-cost-note";
import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { APP } from "@/config/app";
import { DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { PLANS } from "@/config/plans";
import { pricingFaqItems } from "@/content/faq";
import { getLegalVariables } from "@/content/legal";
import { buildBreadcrumbJsonLd } from "@/content/structured-data";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Honest pricing for ${APP.name}: credits that never expire on packs, automatic refunds for failed or low-likeness photos, cancel in one click. Plans from free.`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const legal = getLegalVariables();
  const hasFootnote = Object.values(PLANS).some((p) => p.highlights.some((h) => h.endsWith("*")));
  const promises = [
    { icon: InfinityIcon, text: "Credit-pack credits never expire" },
    { icon: Undo2Icon, text: "Failed and low-likeness shots refunded automatically" },
    { icon: BadgeCheckIcon, text: `Unused purchases refundable for ${legal.refundWindowDays} days` },
    { icon: MousePointerClickIcon, text: "Cancel in one click" },
  ];

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ])}
      />
      <section aria-labelledby="pricing-title" className="grain relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-56 left-1/2 -z-10 h-[30rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.12] blur-3xl dark:opacity-20"
        />
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">
            Pricing
          </p>
          <h1 id="pricing-title" className="mt-3 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
            Honest pricing. <span className="text-brand-gradient italic">No fine print.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            Pay monthly if you shoot often, or buy credits once and keep them forever. Every action shows its cost
            before you click, and anything that goes wrong is refunded automatically.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {promises.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs font-medium shadow-xs"
              >
                <Icon aria-hidden="true" className="size-3.5 text-success" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Plans" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <PlanCards mode="public" />
        {hasFootnote && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            * Draft previews cost 0 credits and are capped at {DRAFT_DAILY_LIMIT_FREE} a day before your first purchase,{" "}
            {DRAFT_DAILY_LIMIT} a day after.
          </p>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Plan credits roll over for {legal.rolloverMonths} month. Prices in USD; taxes may apply at checkout.
          Commercial use included on paid plans.
        </p>
      </section>

      <MarketingSection labelledBy="packs-title" className="pt-8 sm:pt-12">
        <SectionHeading
          id="packs-title"
          eyebrow="Pay as you go"
          title="One-time credit packs"
          lead="No subscription. Top up whenever you like; these credits never expire."
        />
        <div className="mt-10">
          <CreditPackCards mode="public" />
        </div>
      </MarketingSection>

      <MarketingSection labelledBy="costs-title" className="pt-8 sm:pt-12">
        <div id="credit-costs" className="scroll-mt-24">
          <SectionHeading
            id="costs-title"
            eyebrow="Price list"
            title="What everything costs"
            lead="One credit is roughly one standard photo. This table is generated from the same config the app charges from."
          />
        </div>
        <div className="mx-auto mt-10 max-w-3xl">
          <CreditCostTable />
        </div>
        <div className="mt-6">
          <ProviderCostNote />
        </div>
      </MarketingSection>

      <MarketingSection labelledBy="pricing-faq-title" className="max-w-3xl pt-8 sm:pt-12">
        <SectionHeading id="pricing-faq-title" eyebrow="Billing FAQ" title="Refunds, guarantees and the rest" />
        <FaqList items={pricingFaqItems()} className="mt-10" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          More answers in the{" "}
          <Link href="/faq" className="font-medium text-foreground underline underline-offset-4">
            FAQ
          </Link>{" "}
          and the{" "}
          <Link href="/legal/terms#refunds" className="font-medium text-foreground underline underline-offset-4">
            refund terms
          </Link>
          .
        </p>
      </MarketingSection>

      <FinalCta title="Start free. Pay when it's worth it." />
    </>
  );
}
