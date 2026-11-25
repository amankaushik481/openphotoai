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

export type StampTone = "ink" | "muted" | "safelight" | "success" | "warning";

const STAMP_TONE: Record<StampTone, string> = {
  ink: "border-foreground/40 text-foreground",
  muted: "border-foreground/25 text-muted-foreground",
  safelight: "border-safelight-ink/60 text-safelight-ink",
  success: "border-success/50 text-success",
  warning: "border-warning/50 text-warning",
};

/** A lab stamp: a square-cornered mono label for statuses and roles ("PRINTED", "OWNER", "THIS DEVICE"). */
export function Stamp({
  tone = "ink",
  className,
  children,
}: {
  tone?: StampTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 border px-1.5 py-1 font-mono text-[10px] leading-none font-medium tracking-[0.14em] whitespace-nowrap uppercase",
        STAMP_TONE[tone],
        className,
      )}
    >
      {children}
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
