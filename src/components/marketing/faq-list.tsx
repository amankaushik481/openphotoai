import { ChevronDownIcon } from "lucide-react";

import { InlineText } from "@/components/marketing/inline-text";
import { paragraphs } from "@/content/inline";
import type { FaqItem } from "@/content/faq";
import { cn } from "@/lib/utils";

/**
 * Accordion built on native <details>: zero JavaScript, keyboard accessible, and answers stay in the HTML
 * for search engines (a JS accordion would unmount closed panels).
 */
export function FaqList({
  items,
  headingLevel = 3,
  className,
}: {
  items: readonly FaqItem[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("divide-y rounded-2xl border bg-card shadow-xs", className)}>
      {items.map((item) => (
        <details key={item.id} id={item.id} className="group scroll-mt-24 px-5 sm:px-6">
          <summary className="-mx-2 flex cursor-pointer list-none items-start justify-between gap-4 rounded-md px-2 py-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <Heading className="text-base font-medium text-pretty">{item.question}</Heading>
            <ChevronDownIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="-mt-1 flex flex-col gap-3 pb-5 text-sm leading-relaxed text-muted-foreground">
            {paragraphs(item.answer).map((p, i) => (
              <p key={i}>
                <InlineText text={p} />
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
