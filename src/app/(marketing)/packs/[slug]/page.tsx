import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { PackIndexRow, packStudy, StudyFrame, studyLabel } from "@/components/marketing/pack-print";
import { folio, Leader, PAGE } from "@/components/marketing/print-page";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { formatCreditCost } from "@/content/credit-costs";
import { PACK_CATEGORY_INFO, relatedPacks } from "@/content/packs";
import { marketingMetadata, packPath, packSignupHref } from "@/content/site";
import { buildBreadcrumbJsonLd, buildPackJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";
import { getPack, listPackSummaries, listPacks } from "@/server/packs/registry";

type Params = { params: Promise<{ slug: string }> };

/** Every pack page is prerendered; unknown slugs are a static 404. */
export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await listPacks()).map((p) => ({ slug: p.slug }));
}

function metaDescription(tagline: string, description: string): string {
  const text = `${tagline} ${description}`.replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, "")}…` : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const pack = await getPack(slug);
  if (!pack) return {};
  return marketingMetadata({
    title: `${pack.name} AI photo pack`,
    description: metaDescription(pack.tagline, pack.description),
    path: packPath(pack.slug),
    keywords: pack.tags,
    ownShareImage: true,
  });
}

const SUBJECT_LABELS = { man: "Men", woman: "Women", person: "Everyone" } as const;
/** Frames on the brief's contact strip. */
const STRIP_FRAMES = 8;

const crumb = "rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline";

export default async function PackPage({ params }: Params) {
  const { slug } = await params;
  const pack = await getPack(slug);
  if (!pack) notFound();

  const all = await listPackSummaries();
  const related = relatedPacks(pack, all);
  const category = PACK_CATEGORY_INFO[pack.category];
  const fullSetCredits = pack.prompts.length * CREDIT_COSTS.generateStandard;
  const subjects = pack.subjects.includes("person")
    ? "Everyone"
    : pack.subjects.map((s) => SUBJECT_LABELS[s]).join(" & ");
  const no = all.findIndex((p) => p.slug === pack.slug) + 1;
  const frames = Array.from({ length: Math.min(STRIP_FRAMES, pack.prompts.length) }, (_, i) => packStudy(pack, i));

  const spec: [string, string][] = [
    ["Styles", String(pack.prompts.length)],
    ["Format", pack.defaultAspectRatio],
    ["For", subjects],
    ["Per photo", formatCreditCost(CREDIT_COSTS.generateStandard)],
    ["Instant model", `${formatCreditCost(CREDIT_COSTS.generateStandard * INSTANT_MODE_MULTIPLIER)} / photo`],
    ["Drafts", "Free"],
  ];

  return (
    <>
      <JsonLd
        data={[
          buildPackJsonLd(pack),
          buildBreadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Packs", path: "/packs" },
            { name: pack.name, path: packPath(pack.slug) },
          ]),
        ]}
      />

      <div className={cn(PAGE, "pt-10 sm:pt-16")}>
        <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-2.5">
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="mono-caps flex min-w-0 items-baseline gap-2 text-muted-foreground">
              <li>
                <Link href="/packs" className={crumb}>
                  Packs
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`/packs?category=${pack.category}`} className={crumb}>
                  {category.label}
                </Link>
              </li>
              <li aria-hidden="true" className="hidden sm:block">
                /
              </li>
              <li aria-current="page" className="hidden truncate text-foreground sm:block">
                {pack.name}
              </li>
            </ol>
          </nav>
          <p className="mono-caps shrink-0 text-muted-foreground">Shoot brief{no > 0 && <> · No. {folio(no)}</>}</p>
        </div>

        <div className="mt-8 grid gap-10 sm:mt-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            {(pack.isNew || pack.featured) && (
              <p className="mono-caps flex gap-4 text-safelight-ink">
                {pack.isNew && <span>New</span>}
                {pack.featured && <span>Featured</span>}
              </p>
            )}
            <h1 className="mt-3 font-display text-[clamp(3rem,10vw,6.5rem)] leading-[0.9] tracking-[-0.02em]">
              {pack.name}
            </h1>
            <p className="mt-5 font-display text-2xl leading-snug text-pretty italic sm:text-3xl">{pack.tagline}</p>
            <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-pretty text-muted-foreground">
              {pack.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="brand" size="lg" className="w-full rounded-[3px] sm:w-auto">
                <Link href={packSignupHref(pack.slug)}>
                  Use this pack
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full rounded-[3px] sm:w-auto">
                <Link href="/packs">Browse all packs</Link>
              </Button>
            </div>
          </div>

          {/* The brief's spec: a lab ticket with the price in mono. */}
          <aside aria-label="Pack details" className="self-end lg:col-span-4 lg:col-start-9">
            <div className="border-y-2 border-foreground py-4">
              <p className="mono-caps flex items-baseline justify-between text-muted-foreground">
                <span>Full set</span>
                <span>{pack.prompts.length} photos</span>
              </p>
              <p className="mt-2 font-mono text-4xl font-medium tracking-tight tabular-nums">
                {formatCreditCost(fullSetCredits)}
              </p>
            </div>
            <dl className="font-mono text-xs">
              {spec.map(([term, value]) => (
                <div key={term} className="flex items-baseline border-b border-border py-2.5">
                  <dt className="tracking-[0.12em] text-muted-foreground uppercase">{term}</dt>
                  <Leader className="border-foreground/20" />
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Preview every style free with drafts, then render only the ones you like. Below-likeness, failed or
              blocked photos are refunded automatically.
            </p>
          </aside>
        </div>
      </div>

      {/* Contact strip: lighting studies standing in for the pack's frames (illustrations, not outputs). */}
      <figure className="mt-16 sm:mt-20">
        <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
          <ol
            aria-hidden="true"
            className="film flex w-max gap-2 px-4 [--hole:7px] [--pitch:13px] [--rebate:30px] sm:px-8 lg:w-full lg:px-12"
          >
            {frames.map((study, i) => (
              <li key={i} className="relative w-44 shrink-0 sm:w-52 lg:w-auto lg:flex-1">
                <span className="absolute inset-x-1 -top-[29px] truncate font-mono text-[9px] leading-none tracking-[0.14em] uppercase">
                  {i % 2 === 0 ? "OPENSHOOT 400 · SAFETY FILM" : studyLabel(study)}
                </span>
                <StudyFrame id={`strip-${i}`} study={study} className="aspect-[3/2] rounded-[1px]" />
                <span className="absolute -bottom-[29px] left-1 font-mono text-[9px] leading-none">
                  ▸{folio(i + 1)}
                </span>
                <span className="absolute right-6 -bottom-[29px] font-mono text-[9px] leading-none">
                  {folio(i + 1)}A
                </span>
              </li>
            ))}
          </ol>
        </div>
        <figcaption
          className={cn(PAGE, "mono-caps mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-muted-foreground")}
        >
          <span>Contact strip · {pack.name}</span>
          <span>Lighting studies for illustration, not generated photos</span>
        </figcaption>
      </figure>

      <section
        aria-labelledby="shots-title"
        className={cn(PAGE, "mt-20 sm:mt-28", related.length === 0 && "pb-20 sm:pb-28")}
      >
        <div className="grid gap-3 border-t border-foreground pt-3 lg:grid-cols-12 lg:gap-10">
          <p className="mono-caps text-muted-foreground lg:col-span-3 lg:pt-1">
            <span className="text-foreground">No. 02</span>
            <span aria-hidden="true"> / </span>
            <span className="sr-only">: </span>
            Shot list
          </p>
          <div className="lg:col-span-9">
            <h2 id="shots-title" className="font-display text-4xl leading-[0.95] tracking-[-0.015em] sm:text-5xl">
              The shot list
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              {pack.prompts.length} distinct scenes. Generate all of them, or just the ones you like.
            </p>
            <ol className="mt-8 gap-x-10 border-t border-foreground sm:columns-2 xl:columns-3">
              {pack.prompts.map((p, i) => (
                <li
                  key={`${p.title}-${i}`}
                  className="grid break-inside-avoid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline border-b border-border py-3"
                >
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{folio(i + 1)}</span>
                  <span className="text-[0.95rem] font-medium">{p.title}</span>
                </li>
              ))}
            </ol>
            {pack.tags.length > 0 && (
              <ul
                aria-label="Tags"
                className="mt-6 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground"
              >
                {pack.tags.map((tag) => (
                  <li key={tag}>#{tag}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className={cn(PAGE, "mt-20 pb-20 sm:mt-28 sm:pb-28")}>
          <div className="grid gap-3 border-t border-foreground pt-3 lg:grid-cols-12 lg:gap-10">
            <p className="mono-caps text-muted-foreground lg:col-span-3 lg:pt-1">
              <span className="text-foreground">No. 03</span>
              <span aria-hidden="true"> / </span>
              <span className="sr-only">: </span>
              Same drawer
            </p>
            <div className="lg:col-span-9">
              <div className="flex items-end justify-between gap-4">
                <h2 id="related-title" className="font-display text-4xl leading-[0.95] tracking-[-0.015em] sm:text-5xl">
                  You might also like
                </h2>
                <Link
                  href="/packs"
                  className="shrink-0 text-sm font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink"
                >
                  All packs
                </Link>
              </div>
              <ol className="mt-6 border-t border-foreground">
                {related.map((p) => (
                  <PackIndexRow key={p.slug} pack={p} no={all.findIndex((x) => x.slug === p.slug) + 1} />
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}
      <FinalCta
        title={`Ready for your ${pack.name} shoot?`}
        primaryHref={packSignupHref(pack.slug)}
        primaryLabel="Use this pack"
      />
    </>
  );
}
