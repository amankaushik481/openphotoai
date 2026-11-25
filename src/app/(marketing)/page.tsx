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
import { OpenSource } from "@/components/marketing/open-source";
import { PacksShowcase, pickShowcasePacks } from "@/components/marketing/packs-showcase";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { PrivacySafety } from "@/components/marketing/privacy-safety";
import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { featuredFaqItems } from "@/content/faq";
import { marketingMetadata } from "@/content/site";
import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd } from "@/content/structured-data";
import { listPackSummaries } from "@/server/packs/registry";

export const metadata: Metadata = marketingMetadata({
  title: `${APP.name} — ${APP.tagline}`,
  absoluteTitle: true,
  description: APP.description,
  path: "/",
});

export default async function HomePage() {
  const packs = await listPackSummaries();
  const faq = featuredFaqItems();

  return (
    <>
      <JsonLd data={[buildSoftwareApplicationJsonLd(), buildOrganizationJsonLd()]} />
      <Hero />
      <TrustStrip />
      {/* Below the fold: rendered when scrolled near (see `render-lazy`); sizes are rough estimates. */}
      <div className="render-lazy [--render-size:1200px] md:[--render-size:700px]">
        <HowItWorks />
      </div>
      <div className="render-lazy [--render-size:3100px] md:[--render-size:2100px] lg:[--render-size:1350px]">
        <FeatureGrid packCount={packs.length} packNames={pickShowcasePacks(packs, 7).map((p) => p.name)} />
      </div>
      <div className="render-lazy [--render-size:1650px] lg:[--render-size:1170px]">
        <PacksShowcase packs={packs} />
      </div>
      <div className="render-lazy [--render-size:1190px] sm:[--render-size:960px] md:[--render-size:850px] lg:[--render-size:680px] xl:[--render-size:600px]">
        <PrivacySafety />
      </div>
      <div className="render-lazy [--render-size:1720px] sm:[--render-size:1180px] lg:[--render-size:1020px]">
        <ComparisonTable />
      </div>
      <div className="render-lazy [--render-size:1450px] md:[--render-size:960px] lg:[--render-size:710px]">
        <PricingTeaser />
      </div>
      <div className="render-lazy [--render-size:1050px] sm:[--render-size:870px] lg:[--render-size:750px] xl:[--render-size:660px]">
        <OpenSource packCount={packs.length} />
      </div>
      <div className="render-lazy [--render-size:680px]">
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
      </div>
      <div className="render-lazy [--render-size:480px]">
        <FinalCta />
      </div>
    </>
  );
}
