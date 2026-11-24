import { cn } from "@/lib/utils";

export interface SectionHeadingProps {
  /** id of the <h2>, referenced by the section's aria-labelledby. */
  id: string;
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}

export function SectionHeading({ id, eyebrow, title, lead, align = "center", className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" ? "mx-auto max-w-2xl items-center text-center" : "max-w-2xl", className)}>
      {eyebrow && (
        <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">{eyebrow}</p>
      )}
      <h2 id={id} className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
        {title}
      </h2>
      {lead && <p className="text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p>}
    </div>
  );
}

/** Standard vertical rhythm + width for a landing section. */
export function MarketingSection({
  labelledBy,
  className,
  children,
}: {
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy} className={cn("mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28", className)}>
      {children}
    </section>
  );
}
