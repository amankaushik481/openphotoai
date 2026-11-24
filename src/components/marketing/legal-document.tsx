import Link from "next/link";
import { ScaleIcon } from "lucide-react";

import { InlineText } from "@/components/marketing/inline-text";
import { APP } from "@/config/app";
import { LEGAL_PAGES, type LegalBlock, type LegalDocument } from "@/content/legal";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LegalTemplateNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <ScaleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <strong className="font-semibold">Template — have a lawyer review before launch.</strong> {APP.name} ships these
        documents as a starting point. Whoever operates this deployment must adapt them to their business and the laws
        that apply to them.
      </p>
    </div>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case "note":
      return (
        <p className="rounded-lg border-l-2 border-primary/50 bg-muted/50 px-4 py-3 text-sm">
          <InlineText text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {block.head.map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 font-medium text-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b align-top last:border-0">
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row" className="px-4 py-2.5 font-medium text-foreground">
                        <InlineText text={cell} />
                      </th>
                    ) : (
                      <td key={c} className="px-4 py-2.5">
                        <InlineText text={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

const navLink =
  "block rounded-md px-3 py-1.5 text-sm transition-colors";

export function LegalDocumentView({ doc, lastUpdated }: { doc: LegalDocument; lastUpdated: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <LegalTemplateNotice />

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
          <nav aria-label="Legal documents">
            <p className="px-3 pb-2 text-xs font-semibold tracking-wider uppercase">Legal</p>
            <ul className="flex flex-col gap-0.5">
              {LEGAL_PAGES.map((p) => {
                const current = p.slug === doc.slug;
                return (
                  <li key={p.slug}>
                    <Link
                      href={p.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        navLink,
                        current
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <nav aria-label="On this page" className="hidden lg:block">
            <p className="px-3 pb-2 text-xs font-semibold tracking-wider uppercase">On this page</p>
            <ol className="flex flex-col gap-0.5">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={cn(navLink, "py-1 text-muted-foreground hover:text-foreground")}>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0">
          <header>
            <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">
              Legal
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">{doc.title}</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Last updated <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time> · Operated by {APP.legalEntity}
            </p>
          </header>

          <section aria-labelledby="summary-title" className="mt-8 rounded-2xl border bg-card p-6 shadow-xs">
            <h2 id="summary-title" className="text-sm font-semibold tracking-wider uppercase">
              In plain words
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              <InlineText text={doc.summary} />
            </p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {doc.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-gradient" />
                  <span>
                    <InlineText text={h} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-12 flex flex-col gap-12 text-[0.95rem] leading-relaxed text-muted-foreground">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="scroll-mt-24">
                <h2 id={`${s.id}-heading`} className="mb-4 text-xl font-semibold tracking-tight text-foreground">
                  {s.heading}
                </h2>
                <div className="flex flex-col gap-4">
                  {s.blocks.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
