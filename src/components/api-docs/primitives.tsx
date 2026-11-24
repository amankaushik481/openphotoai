/** Small presentational pieces of the API docs (server-renderable; CopyButton hydrates). */
import { Fragment } from "react";

import { CopyButton } from "@/components/app/copy-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/server/openapi/types";
import type { TypePart } from "./schema-view";

/** Renders `code` spans in short CommonMark descriptions; everything else stays plain text. */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part.replace(/\*\*/g, "")}</Fragment>
        ),
      )}
    </>
  );
}

export function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
  return (
    <Badge variant={method === "get" ? "success" : "soft"} className={cn("font-mono uppercase", className)}>
      {method}
    </Badge>
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
          <a key={i} href={`#${schemaAnchor(p.ref)}`} className="text-primary underline-offset-2 hover:underline">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </code>
  );
}

export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 py-1 pr-1 pl-3">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <CopyButton value={code} variant="ghost" size="icon-sm" />
      </div>
      <pre
        tabIndex={0}
        aria-label={`${label} code sample`}
        className="overflow-x-auto p-4 text-[13px] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <code className="font-mono" data-language={language}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/** Simple responsive table (horizontal scroll on small screens). */
export function DocTable({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y align-top">{children}</tbody>
      </table>
    </div>
  );
}
