import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { ComparisonTable } from "@/components/marketing/comparison-table";
import { Folio, SHELL } from "@/components/marketing/editorial";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { JsonLd } from "@/components/marketing/json-ld";
import { LikenessProof } from "@/components/marketing/likeness-proof";
import { OpenSource } from "@/components/marketing/open-source";
import { PacksShowcase } from "@/components/marketing/packs-showcase";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { PrivacySafety } from "@/components/marketing/privacy-safety";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { APP } from "@/config/app";
import { featuredFaqItems } from "@/content/faq";
import { marketingMetadata } from "@/content/site";
import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";
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
  const half = Math.ceil(faq.length / 2);

  return (
    <>
      <JsonLd data={[buildSoftwareApplicationJsonLd(), buildOrganizationJsonLd()]} />
      <Hero />
      <TrustStrip packCount={packs.length} styleCount={packs.reduce((n, p) => n + p.promptCount, 0)} />
      {/* Below the fold: rendered when scrolled near (see `render-lazy`); sizes are rough estimates. */}
      <div className="render-lazy [--render-size:1650px] lg:[--render-size:1250px]">
        <HowItWorks />
      </div>
      <div className="render-lazy [--render-size:2000px] lg:[--render-size:1350px]">
        <LikenessProof />
      </div>
      <div className="render-lazy [--render-size:1950px] lg:[--render-size:1450px]">
        <PacksShowcase packs={packs} />
      </div>
      <div className="render-lazy [--render-size:2500px] lg:[--render-size:1150px]">
        <PrivacySafety />
      </div>
      <div className="render-lazy [--render-size:2700px] lg:[--render-size:1300px]">
        <PricingTeaser />
      </div>
      <div className="render-lazy [--render-size:1900px] sm:[--render-size:1300px]">
        <ComparisonTable />
      </div>
      <div className="render-lazy [--render-size:1700px] lg:[--render-size:1100px]">
        <OpenSource packCount={packs.length} />
      </div>
      <div className="render-lazy [--render-size:1100px] lg:[--render-size:800px]">
        <section aria-labelledby="faq-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
          <div className={cn(SHELL, "grid gap-y-6 lg:grid-cols-12 lg:gap-x-10")}>
            <Folio no="08" label="Questions" className="lg:col-span-12" />
            <h2
              id="faq-title"
              className="font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em] lg:col-span-8"
            >
              Questions, <span className="italic">answered honestly.</span>
            </h2>
            <div className="lg:col-span-4 lg:self-end lg:pb-2">
              <Link
                href="/faq"
                className="inline-flex items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink"
              >
                Read all questions
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
          <div className={cn(SHELL, "mt-12 grid gap-x-10 lg:mt-16 lg:grid-cols-2")}>
            <FaqList items={faq.slice(0, half)} />
            <FaqList items={faq.slice(half)} className="border-t-0 lg:border-t" />
          </div>
        </section>
      </div>
      <div className="render-lazy [--render-size:820px] lg:[--render-size:760px]">
        <FinalCta />
      </div>
    </>
  );
}
