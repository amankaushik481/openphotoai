/** Small presentational pieces of the API docs (server-renderable; CopyButton hydrates). */
import { Fragment } from "react";

import { CopyButton } from "@/components/app/copy-button";
import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/server/openapi/types";
import type { TypePart } from "./schema-view";

/** Inline code on paper. */
export const inlineCode = "rounded-[2px] bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground";

/** Renders `code` spans in short CommonMark descriptions; everything else stays plain text. */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={i} className={inlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part.replace(/\*\*/g, "")}</Fragment>
        ),
      )}
    </>
  );
}

/** HTTP method as a stamped mono tag: reads in darkroom green, writes in safelight. */
export function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] uppercase",
        method === "get" ? "border-success/50 text-success" : "border-safelight-ink/50 text-safelight-ink",
        className,
      )}
    >
      {method}
    </span>
  );
}

export function schemaAnchor(name: string): string {
  return `schema-${name}`;
}

export function TypeLabel({ parts }: { parts: TypePart[] }) {
  return (
    <code className="font-mono text-xs break-words">
      {parts.map((p, i) =>
        p.ref ? (
          <a
            key={i}
            href={`#${schemaAnchor(p.ref)}`}
            className="whitespace-nowrap text-safelight-ink underline decoration-safelight-ink/30 underline-offset-2 hover:decoration-safelight-ink"
          >
            {p.text}
          </a>
        ) : p.sep ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <span key={i} className="whitespace-nowrap">
            {p.text}
          </span>
        ),
      )}
    </code>
  );
}

/**
 * Code sample on a darkroom surface (dark in both themes): a mono caption bar with the copy button, then
 * the scrollable listing.
 */
export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[3px] bg-darkroom text-darkroom-foreground dark:ring-1 dark:ring-darkroom-line">
      <div className="flex items-center justify-between gap-2 border-b border-darkroom-line py-1 pr-1 pl-4">
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-darkroom-muted uppercase">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-darkroom-safelight" />
          {label}
        </span>
        <CopyButton
          value={code}
          variant="ghost"
          size="icon-sm"
          className="text-darkroom-muted outline-darkroom-safelight hover:bg-darkroom-raised hover:text-darkroom-foreground dark:hover:bg-darkroom-raised"
        />
      </div>
      <pre
        tabIndex={0}
        aria-label={`${label} code sample`}
        className="overflow-x-auto p-4 text-[13px] leading-relaxed outline-darkroom-safelight [--focus-offset:-2px]"
      >
        <code className="font-mono" data-language={language}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/** Reference table set like a printed spec sheet (horizontal scroll on small screens). */
export function DocTable({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    // Focusable, named scroller: Safari keyboard users can scroll wide tables (WCAG 2.1.1).
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className="overflow-x-auto border-y border-foreground [--focus-offset:-2px]"
    >
      {/* Cell padding via descendant selectors keeps the (long) reference tables light. */}
      <table className="w-full text-left text-sm [&_td]:py-2.5 [&_td]:pr-4 [&_td:first-child]:pl-0">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-2.5 pr-4 font-mono text-[11px] font-medium tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border align-top">{children}</tbody>
      </table>
    </div>
  );
}
