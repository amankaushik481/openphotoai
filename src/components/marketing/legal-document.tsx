import Link from "next/link";

import { folio, MarginIndex, Masthead, PAGE } from "@/components/marketing/editorial";
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

/** "4. Consent: only you…" → ["4", "Consent: only you…"]; unnumbered headings keep their text. */
function splitHeading(heading: string): [string | null, string] {
  const m = /^(\d+)\.\s+(.*)$/.exec(heading);
  return m ? [m[1]!, m[2]!] : [null, heading];
}

/** Set like a lab notice pinned above the text: the templates must be reviewed before anyone relies on them. */
export function LegalTemplateNotice({ className }: { className?: string }) {
  return (
    <div role="note" className={cn("border-y-2 border-warning py-3 text-sm text-foreground", className)}>
      <p className="mono-caps text-warning">Notice · template</p>
      <p className="mt-1.5 max-w-[80ch]">
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
        <p className="border-l-2 border-foreground py-1 pl-4 text-[0.95rem] text-foreground">
          <InlineText text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-2">
          {block.items.map((item, i) => (
            <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)]">
              <span aria-hidden="true" className="font-mono text-muted-foreground">
                –
              </span>
              <span>
                <InlineText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        // Focusable, named scroller so Safari keyboard users can scroll the wide table.
        <div
          tabIndex={0}
          role="region"
          aria-label={`Table: ${block.head.join(", ")}`}
          className="overflow-x-auto border-y border-foreground [--focus-offset:-2px]"
        >
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {block.head.map((h) => (
                  <th key={h} scope="col" className="mono-caps py-2.5 pr-4 font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-border align-top last:border-0">
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row" className="py-2.5 pr-4 font-medium text-foreground">
                        <InlineText text={cell} />
                      </th>
                    ) : (
                      <td key={c} className="py-2.5 pr-4">
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

/** The other legal documents, as a short numbered list. */
function DocumentsNav({ current }: { current: LegalDocument["slug"] }) {
  return (
    <nav aria-label="Legal documents">
      <p className="mono-caps pb-2">Documents</p>
      <ol className="border-t border-border">
        {LEGAL_PAGES.map((p, i) => {
          const active = p.slug === current;
          return (
            <li key={p.slug} className="border-b border-border">
              <Link
                href={p.href}
                aria-current={active ? "page" : undefined}
                className="group flex items-baseline gap-3 py-3 text-sm text-muted-foreground transition-colors [--focus-offset:-2px] hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground lg:py-1.5"
              >
                <span className="font-mono text-[11px] tabular-nums group-aria-[current=page]:text-safelight-ink">
                  {String.fromCharCode(65 + i)}
                </span>
                {p.title}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function LegalDocumentView({ doc, lastUpdated }: { doc: LegalDocument; lastUpdated: string }) {
  const index = doc.sections.map((s) => {
    const [n, text] = splitHeading(s.heading);
    return { href: `#${s.id}`, label: text, no: n ? folio(Number(n)) : undefined };
  });
  return (
    <>
      <Masthead
        section="Legal"
        meta={
          <>
            Last updated <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
          </>
        }
        title={doc.title}
        lead={<>Operated by {APP.legalEntity}.</>}
      />

      <div className={cn(PAGE, "mt-10 grid gap-10 pb-20 sm:mt-14 sm:pb-28 lg:grid-cols-12")}>
        <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:col-span-3 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
          <DocumentsNav current={doc.slug} />
          <MarginIndex label="On this page" heading="On this page" items={index} mobile="fold" />
        </aside>

        <article className="min-w-0 lg:col-span-9 lg:max-w-[46rem]">
          <LegalTemplateNotice />

          <section aria-labelledby="summary-title" className="mt-10">
            <h2 id="summary-title" className="font-display text-3xl leading-tight">
              In plain words
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-pretty text-foreground/85">
              <InlineText text={doc.summary} />
            </p>
            <ol className="mt-6 border-t border-foreground">
              {doc.highlights.map((h, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b border-border py-3 text-[0.95rem] leading-relaxed"
                >
                  <span aria-hidden="true" className="font-mono text-[11px] text-safelight-ink tabular-nums">
                    {folio(i + 1)}
                  </span>
                  <span>
                    <InlineText text={h} />
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-16 flex flex-col gap-14 text-[0.975rem] leading-relaxed text-foreground/85">
            {doc.sections.map((s) => {
              const [n, text] = splitHeading(s.heading);
              return (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="scroll-mt-24">
                  <h2
                    id={`${s.id}-heading`}
                    className="flex items-baseline gap-3 border-t border-foreground pt-3 font-display text-[1.75rem] leading-tight text-foreground sm:text-3xl"
                  >
                    {n && (
                      <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground">
                        §&nbsp;{folio(Number(n))}
                      </span>
                    )}
                    <span>{text}</span>
                  </h2>
                  <div className="mt-5 flex flex-col gap-4">
                    {s.blocks.map((b, i) => (
                      <Block key={i} block={b} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </article>
      </div>
    </>
  );
}
