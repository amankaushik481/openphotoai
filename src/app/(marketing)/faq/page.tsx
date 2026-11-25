import type { Metadata } from "next";

import { FaqEntries, folio, MarginIndex, Masthead, PAGE } from "@/components/marketing/editorial";
import { FinalCta } from "@/components/marketing/final-cta";
import { JsonLd } from "@/components/marketing/json-ld";
import { APP } from "@/config/app";
import { allFaqItems, getFaqCategories } from "@/content/faq";
import { marketingMetadata } from "@/content/site";
import { buildFaqPageJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = marketingMetadata({
  title: "FAQ",
  description: `Answers about ${APP.name}: how many selfies you need, likeness and refunds, privacy and face data, credits and billing, and self-hosting the open-source app.`,
  path: "/faq",
});

export default function FaqPage() {
  const categories = getFaqCategories();
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  // Questions are numbered straight through the page, like a printed Q&A.
  const starts = categories.map((_, i) => 1 + categories.slice(0, i).reduce((n, c) => n + c.items.length, 0));

  return (
    <>
      <JsonLd data={buildFaqPageJsonLd(allFaqItems(categories))} />
      <Masthead
        section="FAQ"
        meta={`${total} answers`}
        title={
          <>
            Questions, <em className="italic">answered.</em>
          </>
        }
        lead={
          <>
            Can&apos;t find what you need? Email{" "}
            <a
              href={`mailto:${APP.supportEmail}`}
              className="font-medium break-words text-foreground underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink"
            >
              {APP.supportEmail}
            </a>
            . A human answers.
          </>
        }
      />

      <div className={cn(PAGE, "mt-14 grid gap-12 pb-20 sm:mt-20 sm:pb-28 lg:grid-cols-12 lg:gap-10")}>
        <div className="lg:col-span-3">
          <MarginIndex
            label="FAQ categories"
            heading="In this issue"
            mobile="inline"
            className="lg:sticky lg:top-24"
            items={categories.map((c, i) => ({
              href: `#${c.id}`,
              label: c.title,
              // Like page numbers in a printed index: where this category's questions run.
              meta: `Q.${folio(starts[i]!)}–${folio(starts[i]! + c.items.length - 1)}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-20 lg:col-span-9 lg:max-w-[58rem]">
          {categories.map((c, i) => (
            <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-24">
              <p className="mono-caps text-muted-foreground">
                <span className="text-foreground">No. {folio(i + 1)}</span>
                <span aria-hidden="true"> / </span>
                <span className="sr-only">: </span>
                {c.items.length} {c.items.length === 1 ? "question" : "questions"}
              </p>
              <h2
                id={`${c.id}-title`}
                className="mt-3 font-display text-4xl leading-[0.95] tracking-[-0.015em] sm:text-5xl"
              >
                {c.title}
              </h2>
              <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">{c.description}</p>
              <FaqEntries items={c.items} start={starts[i]} className="mt-8" />
            </section>
          ))}
        </div>
      </div>
      <FinalCta />
    </>
  );
}
