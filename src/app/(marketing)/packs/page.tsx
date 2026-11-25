import type { Metadata } from "next";
import Link from "next/link";
import { FileJsonIcon } from "lucide-react";

import { PackCard } from "@/components/app/pack-card";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { PackCategoryFilter } from "@/components/marketing/pack-category-filter";
import { APP } from "@/config/app";
import { packCategoryCounts, packSearchEntry } from "@/content/packs";
import { marketingMetadata } from "@/content/site";
import { buildBreadcrumbJsonLd, buildPackListJsonLd } from "@/content/structured-data";
import { listPackSummaries } from "@/server/packs/registry";

export async function generateMetadata(): Promise<Metadata> {
  const packs = await listPackSummaries();
  return marketingMetadata({
    title: "AI photo packs",
    description: `${packs.length} AI photo packs for LinkedIn headshots, dating, travel, fashion and more. Preview any pack free, then generate photos that look like you with ${APP.name}.`,
    path: "/packs",
  });
}

export default async function PacksPage() {
  const packs = await listPackSummaries();
  const categories = packCategoryCounts(packs);
  const styles = packs.reduce((n, p) => n + p.promptCount, 0);

  return (
    <>
      <JsonLd
        data={[
          buildPackListJsonLd(packs),
          buildBreadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Packs", path: "/packs" },
          ]),
        ]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
        <header className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">
            Photo packs
          </p>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            {packs.length} shoots.{" "}
            <span className="text-brand-gradient italic">{styles.toLocaleString("en-US")} styles.</span>
          </h1>
          <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
            Every pack is a full photo shoot: a set of distinct scenes, outfits and lighting setups. Pick one, preview
            it free with drafts, and render the keepers in full quality.
          </p>
        </header>

        <div className="mt-10">
          {packs.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              No packs are installed yet. Add JSON files to the <code className="font-mono">packs/</code> folder.
            </p>
          ) : (
            <PackCategoryFilter categories={categories} index={packs.map(packSearchEntry)}>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {packs.map((pack, i) => (
                  <li key={pack.slug} data-slug={pack.slug} data-category={pack.category}>
                    <PackCard pack={pack} priority={i < 4} />
                  </li>
                ))}
              </ul>
            </PackCategoryFilter>
          )}
        </div>

        <aside className="mt-16 flex flex-col items-start gap-4 rounded-2xl border border-dashed bg-muted/30 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
              <FileJsonIcon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Packs are open JSON files</h2>
              <p className="text-sm text-muted-foreground">
                Write your own shoot in minutes and share it with any {APP.name} deployment. No code required.
              </p>
            </div>
          </div>
          <Link
            href="/docs#packs"
            className="shrink-0 text-sm font-medium underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:rounded-sm"
          >
            Read the pack format
          </Link>
        </aside>
      </div>
      <FinalCta title="Your shoot is one click away." />
    </>
  );
}
