import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small mono label above the title (e.g. a section name or a folio). */
  eyebrow?: React.ReactNode;
  /** Buttons on the right (stack under the title on mobile). */
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}

/** Editorial page head: a big left-aligned serif title over a hairline rule, mono marginalia above it. */
export function PageHeader({ title, description, eyebrow, actions, back, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {back && (
          <Link
            href={back.href}
            className="-ml-0.5 inline-flex w-fit items-center gap-1.5 rounded-xs py-1 font-mono text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && <p className="mono-caps text-safelight-ink">{eyebrow}</p>}
        <h1 className="font-display text-[2.5rem] leading-[0.95] tracking-[-0.015em] sm:text-5xl lg:text-[3.5rem]">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
