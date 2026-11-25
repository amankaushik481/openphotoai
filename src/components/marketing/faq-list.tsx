import { InlineText } from "@/components/marketing/inline-text";
import { paragraphs } from "@/content/inline";
import type { FaqItem } from "@/content/faq";
import { cn } from "@/lib/utils";

/**
 * Accordion built on native <details>: zero JavaScript, keyboard accessible, and answers stay in the HTML
 * for search engines (a JS accordion would unmount closed panels). Set as a ruled list, not a card.
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
    <div className={cn("border-t border-foreground", className)}>
      {items.map((item) => (
        <details key={item.id} id={item.id} className="group scroll-mt-24 border-b border-border">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm py-5 [&::-webkit-details-marker]:hidden">
            <Heading className="text-[1.0625rem] leading-snug font-medium text-pretty">{item.question}</Heading>
            <span
              aria-hidden="true"
              className="mt-px font-mono text-xl leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:text-safelight-ink"
            >
              +
            </span>
          </summary>
          <div className="-mt-1 flex max-w-[64ch] flex-col gap-3 pr-8 pb-6 text-[0.9375rem] leading-relaxed text-muted-foreground">
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
