import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { ComparisonTable } from "@/components/marketing/comparison-table";
import { FaqList } from "@/components/marketing/faq-list";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { JsonLd } from "@/components/marketing/json-ld";
import { PacksShowcase, pickShowcasePacks } from "@/components/marketing/packs-showcase";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { featuredFaqItems } from "@/content/faq";
import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd } from "@/content/structured-data";
import { listPackSummaries } from "@/server/packs/registry";

export const metadata: Metadata = {
  title: { absolute: `${APP.name} — ${APP.tagline}` },
  description: APP.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const packs = await listPackSummaries();
  const faq = featuredFaqItems();

  return (
    <>
      <JsonLd data={[buildSoftwareApplicationJsonLd(), buildOrganizationJsonLd()]} />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <FeatureGrid packCount={packs.length} packNames={pickShowcasePacks(packs, 7).map((p) => p.name)} />
      <PacksShowcase packs={packs} />
      <ComparisonTable />
      <PricingTeaser />
      <MarketingSection labelledBy="faq-title" className="max-w-3xl">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered honestly." />
        <FaqList items={faq} className="mt-10" />
        <div className="mt-6 flex justify-center">
          <Button asChild variant="ghost">
            <Link href="/faq">
              Read all questions
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </MarketingSection>
      <FinalCta />
    </>
  );
}
