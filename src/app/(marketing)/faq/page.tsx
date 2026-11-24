import type { Metadata } from "next";

import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { APP } from "@/config/app";
import { allFaqItems, getFaqCategories } from "@/content/faq";
import { buildFaqPageJsonLd } from "@/content/structured-data";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Answers about ${APP.name}: how many selfies you need, likeness and refunds, privacy and face data, credits and billing, and self-hosting the open-source app.`,
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const categories = getFaqCategories();

  return (
    <>
      <JsonLd data={buildFaqPageJsonLd(allFaqItems(categories))} />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
        <header className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">FAQ</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Can&apos;t find what you need? Email{" "}
            <a href={`mailto:${APP.supportEmail}`} className="font-medium text-foreground underline underline-offset-4">
              {APP.supportEmail}
            </a>
            . A human answers.
          </p>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-14">
          <nav aria-label="FAQ categories" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
              {categories.map((c) => (
                <li key={c.id} className="shrink-0">
                  <a
                    href={`#${c.id}`}
                    className="inline-flex h-9 items-center rounded-full border bg-card px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:w-full lg:rounded-md lg:border-0 lg:bg-transparent lg:px-3 lg:hover:bg-accent"
                  >
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-14">
            {categories.map((c) => (
              <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-24">
                <h2 id={`${c.id}-title`} className="font-display text-3xl tracking-tight sm:text-4xl">
                  {c.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                <FaqList items={c.items} className="mt-6" />
              </section>
            ))}
          </div>
        </div>
      </div>
      <FinalCta />
    </>
  );
}
