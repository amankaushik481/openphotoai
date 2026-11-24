import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { PackCard } from "@/components/app/pack-card";
import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import type { PackSummary } from "@/types/pack";

/** Featured packs first (registry order), then the rest, capped at `limit`. */
export function pickShowcasePacks(packs: readonly PackSummary[], limit = 8): PackSummary[] {
  return [...packs.filter((p) => p.featured), ...packs.filter((p) => !p.featured)].slice(0, limit);
}

export function PacksShowcase({ packs }: { packs: readonly PackSummary[] }) {
  const showcase = pickShowcasePacks(packs);
  if (showcase.length === 0) return null;
  return (
    <MarketingSection labelledBy="packs-title" className="pt-4 sm:pt-8">
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          id="packs-title"
          align="left"
          className="items-center text-center md:items-start md:text-left"
          eyebrow="Photo packs"
          title="Pick a shoot. We'll handle the light."
          lead={`${packs.length} curated packs, each a full set of distinct styles. Preview every one free with drafts.`}
        />
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/packs">
            Browse all {packs.length} packs
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
      <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {showcase.map((pack) => (
          <li key={pack.slug}>
            <PackCard pack={pack} />
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}
