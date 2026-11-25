import type { Metadata } from "next";
import Link from "next/link";

import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { PackCategoryFilter } from "@/components/marketing/pack-category-filter";
import { PackIndexRow } from "@/components/marketing/pack-print";
import { Masthead, PAGE } from "@/components/marketing/print-page";
import { APP } from "@/config/app";
import { PACK_CATEGORY_INFO, packCategoryCounts, packSearchEntry } from "@/content/packs";
import { marketingMetadata } from "@/content/site";
import { buildBreadcrumbJsonLd, buildPackListJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";
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
  // Grouped by category, numbered straight through like a printed index.
  let n = 0;
  const groups = categories.map((c) => ({
    ...c,
    packs: packs.filter((p) => p.category === c.id).map((pack) => ({ pack, no: ++n })),
  }));

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
      <Masthead
        section="Pack index"
        meta={`${packs.length} packs · ${categories.length} sections`}
        title={
          <>
            {packs.length} shoots. <em className="italic">{styles.toLocaleString("en-US")} styles.</em>
          </>
        }
        lead="Every pack is a full photo shoot: a set of distinct scenes, outfits and lighting setups. Pick one, preview it free with drafts, and render the keepers in full quality."
      />

      <div className={cn(PAGE, "mt-12 pb-20 sm:mt-16 sm:pb-28")}>
        {packs.length === 0 ? (
          <div className="border-y border-foreground py-12">
            <div aria-hidden="true" className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="aspect-[4/5] w-16 border border-dashed border-foreground/40 sm:w-20" />
              ))}
            </div>
            <p className="mono-caps mt-6 text-muted-foreground">Empty roll</p>
            <p className="mt-2 text-muted-foreground">
              No packs are installed yet. Add JSON files to the <code className="font-mono">packs/</code> folder.
            </p>
          </div>
        ) : (
          <PackCategoryFilter categories={categories} index={packs.map(packSearchEntry)}>
            <div className="flex flex-col gap-14">
              {groups.map((g, i) => (
                <section
                  key={g.id}
                  data-group={g.id}
                  aria-labelledby={`cat-${g.id}`}
                  // Sections below the fold skip layout and paint until they scroll near (~92px a row).
                  className={i > 0 ? "render-lazy" : undefined}
                  style={i > 0 ? ({ "--render-size": `${80 + g.count * 92}px` } as React.CSSProperties) : undefined}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-foreground pb-3">
                    <h2 id={`cat-${g.id}`} className="font-display text-3xl leading-none sm:text-4xl">
                      {g.label}
                    </h2>
                    <p className="mono-caps text-muted-foreground">
                      {PACK_CATEGORY_INFO[g.id].blurb.replace(/\.$/, "")} · {g.count}
                    </p>
                  </div>
                  <ol>
                    {g.packs.map(({ pack, no }) => (
                      <PackIndexRow key={pack.slug} pack={pack} no={no} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </PackCategoryFilter>
        )}

        <aside className="mt-20 grid gap-6 border-t border-foreground pt-6 lg:grid-cols-12 lg:gap-10">
          <p className="mono-caps text-muted-foreground lg:col-span-3">Colophon</p>
          <div className="lg:col-span-9 lg:flex lg:items-end lg:justify-between lg:gap-10">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl leading-tight">Packs are open JSON files</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Write your own shoot in minutes and share it with any {APP.name} deployment. No code required. The
                prints on this page are lighting studies, not generated photos.
              </p>
            </div>
            <Link
              href="/docs#packs"
              className="mt-4 inline-flex shrink-0 text-sm font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink lg:mt-0"
            >
              Read the pack format
            </Link>
          </div>
        </aside>
      </div>
      <FinalCta title="Your shoot is one click away." />
    </>
  );
}
