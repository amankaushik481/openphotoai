/**
 * Printed-page building blocks for the public pages (pricing, packs, FAQ, legal, docs): a magazine masthead,
 * folio-numbered section openers, dotted price-list leaders, an edge-print rule and a margin index.
 * Server components; no client JS.
 */
import { SHELL } from "@/components/marketing/editorial";
import { InlineText } from "@/components/marketing/inline-text";
import type { FaqItem } from "@/content/faq";
import { paragraphs } from "@/content/inline";
import { cn } from "@/lib/utils";

/** Two-digit folio number: 1 → "01". */
export function folio(n: number): string {
  return String(n).padStart(2, "0");
}

/** Width + gutters: the landing page's editorial measure, shared with the marketing header. */
export const PAGE = SHELL;

/**
 * Page opener: a mono running head over an ink rule, then a big left-aligned serif title with the lead set
 * in the margin beside it on wide screens.
 */
export function Masthead({
  section,
  meta,
  title,
  lead,
  children,
  titleId,
  className,
}: {
  /** Running head, e.g. "Price list". Rendered as mono caps. */
  section: string;
  /** Right side of the running head (dates, counts…): short and true. */
  meta?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Extra content under the lead (buttons, readouts). */
  children?: React.ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={cn(PAGE, "pt-10 sm:pt-16", className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-foreground pb-2.5">
        <p className="mono-caps">{section}</p>
        {meta && <p className="mono-caps shrink-0 text-right whitespace-nowrap text-muted-foreground">{meta}</p>}
      </div>
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-12 lg:gap-10">
        <h1
          id={titleId}
          className="font-display text-[clamp(3rem,11vw,7.25rem)] leading-[0.9] tracking-[-0.02em] lg:col-span-8"
        >
          {title}
        </h1>
        {(lead || children) && (
          <div className="flex flex-col gap-5 lg:col-span-4 lg:self-end lg:pb-2">
            {lead && <div className="max-w-[60ch] text-base text-pretty text-muted-foreground sm:text-lg">{lead}</div>}
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Section opener: an ink rule, the folio and label in the left margin, the serif heading beside it.
 * `id` goes on the <h2> (reference it with the section's aria-labelledby).
 */
export function SectionHead({
  id,
  no,
  label,
  title,
  lead,
  aside,
  className,
}: {
  id: string;
  no: number;
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Right-aligned extra on wide screens (a link, a toggle). */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 border-t border-foreground pt-3 lg:grid-cols-12 lg:gap-10", className)}>
      <p className="mono-caps text-muted-foreground lg:col-span-3 lg:pt-1">
        <span className="text-foreground">No. {folio(no)}</span>
        <span aria-hidden="true"> / </span>
        <span className="sr-only">: </span>
        {label}
      </p>
      <div className="flex flex-col gap-3 lg:col-span-9 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="max-w-2xl">
          <h2 id={id} className="font-display text-4xl leading-[0.95] tracking-[-0.015em] sm:text-5xl">
            {title}
          </h2>
          {lead && <p className="mt-3 text-base text-pretty text-muted-foreground">{lead}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </div>
  );
}

/** Dotted price-list leader between a label and its value (decorative, flexes to fill the row). */
export function Leader({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mx-2 h-[0.7em] min-w-4 flex-1 self-baseline border-b-2 border-dotted border-foreground/30",
        className,
      )}
    />
  );
}

/**
 * Film edge print as a divider: frame numbers and the stock name between hairlines, as printed along
 * the rebate of a negative. Decorative.
 */
export function EdgeRule({
  frame = "12",
  text = "OPENSHOOT 400 · SAFETY FILM",
  className,
}: {
  frame?: string;
  text?: string;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("mono-caps flex items-center gap-3 text-muted-foreground", className)}>
      <span>▸ {frame}</span>
      <span className="h-px flex-1 bg-border" />
      <span className="hidden whitespace-nowrap sm:inline">{text}</span>
      <span className="hidden h-px flex-1 bg-border sm:block" />
      <span>{frame}A</span>
    </div>
  );
}

export interface IndexItem {
  href: string;
  label: string;
  /** Overrides the running number. */
  no?: string;
  /** Right-aligned mono note (a count, a page number). */
  meta?: string;
  current?: boolean;
}

/**
 * The margin index of a long page: a numbered list of anchors in mono, sticky beside the text on wide
 * screens. Phones get it inline (`inline`), folded into a <details> (`fold`), or not at all (`none`).
 */
export function MarginIndex({
  label,
  heading = "Index",
  items,
  mobile = "fold",
  className,
}: {
  /** Accessible name of the <nav>. */
  label: string;
  /** Visible heading over the list. */
  heading?: string;
  items: IndexItem[];
  mobile?: "inline" | "fold" | "none";
  className?: string;
}) {
  const list = (
    <ol className="border-t border-border">
      {items.map((item, i) => (
        <li key={item.href} className="border-b border-border">
          <a
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            className="group flex items-baseline gap-3 py-3 text-sm text-muted-foreground transition-colors [--focus-offset:-2px] hover:text-foreground aria-[current=page]:text-foreground lg:py-1.5"
          >
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums group-aria-[current=page]:text-safelight-ink">
              {item.no ?? folio(i + 1)}
            </span>
            <span className="text-pretty group-hover:underline group-hover:underline-offset-4 group-aria-[current=page]:font-medium">
              {item.label}
            </span>
            {item.meta && (
              <span className="ml-auto pl-2 font-mono text-[11px] text-muted-foreground tabular-nums">{item.meta}</span>
            )}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav aria-label={label} className={cn("hidden lg:block", className)}>
        <p className="mono-caps pb-2">{heading}</p>
        {list}
      </nav>
      {mobile === "inline" && (
        <nav aria-label={label} className="lg:hidden">
          <p className="mono-caps pb-2">{heading}</p>
          {list}
        </nav>
      )}
      {mobile === "fold" && (
        <details className="group border-y border-border lg:hidden">
          <summary className="mono-caps flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            {heading}
            <span aria-hidden="true" className="font-sans text-base transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <nav aria-label={label} className="pb-3">
            {list}
          </nav>
        </details>
      )}
    </>
  );
}

/**
 * Long-form Q&A: numbered questions over hairlines, each a native <details> (zero JS, keyboard accessible,
 * answers stay in the HTML for search engines and open on find-in-page / #anchor links).
 */
export function FaqEntries({
  items,
  start = 1,
  className,
}: {
  items: readonly FaqItem[];
  /** Number of the first question (continues the count across categories). */
  start?: number;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-foreground", className)}>
      {items.map((item, i) => (
        <details key={item.id} id={item.id} className="group scroll-mt-24 border-b border-border">
          <summary className="grid cursor-pointer list-none grid-cols-[2.75rem_minmax(0,1fr)_1.25rem] items-baseline gap-x-2 py-5 [--focus-offset:-2px] sm:grid-cols-[3.5rem_minmax(0,1fr)_1.5rem] [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Q.{folio(start + i)}
            </span>
            <h3 className="text-[1.0625rem] leading-snug font-medium text-pretty group-hover:underline group-hover:decoration-foreground/30 group-hover:underline-offset-4 sm:text-lg">
              {item.question}
            </h3>
            <span
              aria-hidden="true"
              className="justify-self-end font-mono text-lg leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:text-safelight-ink"
            >
              +
            </span>
          </summary>
          <div className="flex max-w-[68ch] flex-col gap-3 pb-6 pl-[3.25rem] text-[0.975rem] leading-relaxed text-foreground/85 sm:pl-16">
            {paragraphs(item.answer).map((p, j) => (
              <p key={j}>
                <InlineText text={p} />
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * A light-meter style readout strip: numbered facts in mono caps, one cell each between hairlines (two per
 * row on phones, all in one row on wide screens).
 */
export function Readout({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul
      style={{ "--cells": items.length } as React.CSSProperties}
      className={cn(
        "grid grid-cols-2 gap-px border-y border-border bg-border lg:grid-cols-[repeat(var(--cells),minmax(0,1fr))]",
        className,
      )}
    >
      {items.map((item, i) => (
        <li
          key={i}
          className="mono-caps flex gap-2.5 bg-background py-3 pr-3 leading-normal text-foreground/80 not-first:pl-3 max-lg:odd:pl-0"
        >
          <span aria-hidden="true" className="text-safelight-ink tabular-nums">
            {folio(i + 1)}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
