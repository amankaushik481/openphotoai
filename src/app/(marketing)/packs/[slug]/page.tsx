import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, ChevronRightIcon, ShieldCheckIcon, Undo2Icon, ZapIcon } from "lucide-react";

import { PackCard, packGradient } from "@/components/app/pack-card";
import { PortraitArt, packStudy } from "@/components/marketing/portrait-art";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { formatCreditCost } from "@/content/credit-costs";
import { PACK_CATEGORY_INFO, relatedPacks } from "@/content/packs";
import { marketingMetadata, packPath, packSignupHref } from "@/content/site";
import { buildBreadcrumbJsonLd, buildPackJsonLd } from "@/content/structured-data";
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
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link href="/packs" className="rounded-sm hover:text-foreground">
                Packs
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li>
              <Link href={`/packs?category=${pack.category}`} className="rounded-sm hover:text-foreground">
                {category.label}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li aria-current="page" className="truncate text-foreground">
              {pack.name}
            </li>
          </ol>
        </nav>

        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div
            className="grain-over relative mx-auto aspect-[16/10] w-full max-w-md overflow-hidden rounded-[2px] shadow-print sm:aspect-[4/5] lg:sticky lg:top-24"
            style={pack.cover ? undefined : { backgroundImage: packGradient(pack.colors) }}
          >
            {pack.cover ? (
              <Image
                src={pack.cover}
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
            ) : (
              <PortraitArt id={`pack-cover-${pack.slug}`} {...packStudy(pack)} />
            )}
            <span className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {pack.prompts.length} styles · {pack.defaultAspectRatio}
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft">{category.label}</Badge>
              {pack.isNew && <Badge variant="brand">New</Badge>}
              {pack.featured && <Badge variant="outline">Featured</Badge>}
            </div>
            <h1 className="mt-4 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">{pack.name}</h1>
            <p className="mt-4 text-lg text-pretty text-foreground/90">{pack.tagline}</p>
            <p className="mt-4 text-base text-pretty text-muted-foreground">{pack.description}</p>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
              {[
                { term: "Styles", value: String(pack.prompts.length) },
                { term: "Format", value: pack.defaultAspectRatio },
                { term: "For", value: subjects },
                { term: "Full set", value: formatCreditCost(fullSetCredits) },
              ].map((item) => (
                <div key={item.term} className="flex flex-col gap-1 bg-card px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{item.term}</dt>
                  <dd className="text-sm font-semibold">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatCreditCost(CREDIT_COSTS.generateStandard)} per standard photo (
              {formatCreditCost(CREDIT_COSTS.generateStandard * INSTANT_MODE_MULTIPLIER)} with an Instant model). Drafts
              are free, and you choose which styles to render.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
                <Link href={packSignupHref(pack.slug)}>
                  Use this pack
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/packs">Browse all packs</Link>
              </Button>
            </div>

            <ul className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ZapIcon aria-hidden="true" className="size-4 text-success" />
                Preview every style free with drafts before you spend a credit.
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon aria-hidden="true" className="size-4 text-success" />
                Best shots first. Below-likeness photos are hidden and refunded.
              </li>
              <li className="flex items-center gap-2">
                <Undo2Icon aria-hidden="true" className="size-4 text-success" />
                Failed or blocked results are refunded automatically.
              </li>
            </ul>

            {pack.tags.length > 0 && (
              <ul aria-label="Tags" className="mt-8 flex flex-wrap gap-2">
                {pack.tags.map((tag) => (
                  <li key={tag} className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                    #{tag}
                  </li>
                ))}
              </ul>
            )}

            <section aria-labelledby="shots-title" className="mt-12">
              <h2 id="shots-title" className="font-display text-3xl tracking-tight sm:text-4xl">
                The shot list
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {pack.prompts.length} distinct scenes. Generate all of them, or just the ones you like.
              </p>
              <ol className="mt-6 grid gap-x-6 sm:grid-cols-2">
                {pack.prompts.map((p, i) => (
                  <li key={`${p.title}-${i}`} className="flex items-baseline gap-3 border-b py-3">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-medium">{p.title}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-24">
            <div className="flex items-end justify-between gap-4">
              <h2 id="related-title" className="font-display text-3xl tracking-tight sm:text-4xl">
                You might also like
              </h2>
              <Link
                href="/packs"
                className="shrink-0 text-sm font-medium underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                All packs
              </Link>
            </div>
            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
              {related.map((p) => (
                <li key={p.slug}>
                  <PackCard pack={p} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <FinalCta
        title={`Ready for your ${pack.name} shoot?`}
        primaryHref={packSignupHref(pack.slug)}
        primaryLabel="Use this pack"
      />
    </>
  );
}
