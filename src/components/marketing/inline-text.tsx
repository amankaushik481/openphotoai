import Link from "next/link";

import { isExternalHref, parseInline } from "@/content/inline";

const linkClass =
  "font-medium text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm";

/** Renders copy written with the tiny inline markup from `@/content/inline`. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, i) => {
        switch (token.type) {
          case "strong":
            return (
              <strong key={i} className="font-semibold text-foreground">
                {token.text}
              </strong>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
                {token.text}
              </code>
            );
          case "link":
            if (isExternalHref(token.href)) {
              return (
                <a key={i} href={token.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {token.text}
                </a>
              );
            }
            if (token.href.startsWith("mailto:")) {
              return (
                <a key={i} href={token.href} className={`${linkClass} break-all`}>
                  {token.text}
                </a>
              );
            }
            return (
              <Link key={i} href={token.href} className={linkClass}>
                {token.text}
              </Link>
            );
          default:
            return <span key={i}>{token.text}</span>;
        }
      })}
    </>
  );
}
