import { cn } from "@/lib/utils";

/**
 * Light-meter style readouts for the studio: credit costs on action buttons, mono labels for panels and
 * dotted-leader rows. Visual only where noted; the accessible name or description carries the same text.
 */

/** Mono uppercase micro-label for panel and section headings. */
export const MONO_LABEL = "mono-caps text-muted-foreground";

/** A credit cost printed on a button like a meter readout: "2+ CR", "FREE". Decorative (`aria-hidden`). */
export function CreditReadout({
  credits,
  from = false,
  className,
}: {
  credits: number;
  from?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-0.5 border-l border-current/25 pl-2 font-mono text-[10px] font-normal tracking-[0.12em] text-muted-foreground uppercase tabular-nums",
        className,
      )}
    >
      {credits > 0 ? `${credits}${from ? "+" : ""} cr` : "Free"}
    </span>
  );
}

/** A label ······· value row (a lab ledger / spec sheet line). Render inside a `<dl>`. */
export function LeaderRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <dt className="shrink-0 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-0.2em] border-b border-dotted border-foreground/30" />
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
