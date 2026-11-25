import { cn } from "@/lib/utils";

export type LabNoticeTone = "info" | "success" | "warning" | "danger" | "working";

const TONE: Record<LabNoticeTone, { rule: string; label: string }> = {
  info: { rule: "border-foreground/40", label: "text-muted-foreground" },
  success: { rule: "border-success", label: "text-success" },
  warning: { rule: "border-warning", label: "text-warning" },
  danger: { rule: "border-safelight-ink", label: "text-safelight-ink" },
  working: { rule: "border-safelight-ink", label: "text-safelight-ink" },
};

/**
 * A lab notice: a ruled slip pinned to the page (checkout returns, test mode, payment problems). A mono
 * label names the kind of notice; the title and body say what happened in plain words.
 */
export function LabNotice({
  label,
  title,
  children,
  tone = "info",
  role,
  action,
  className,
  titleAs: Title = "p",
}: {
  /** Mono kicker, e.g. "Lab notice · received". */
  label: string;
  title?: React.ReactNode;
  children?: React.ReactNode;
  tone?: LabNoticeTone;
  role?: "status" | "alert" | "note";
  /** Rendered top-right (e.g. a dismiss button). */
  action?: React.ReactNode;
  className?: string;
  titleAs?: "p" | "h1" | "h2" | "h3";
}) {
  const t = TONE[tone];
  return (
    <div
      role={role}
      className={cn("relative flex flex-col gap-1 border-l-2 bg-card py-3 pr-12 pl-4 text-sm", t.rule, className)}
    >
      <p className={cn("mono-caps flex items-center gap-2", t.label)}>
        {tone === "working" && (
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-safelight/60 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-safelight" />
          </span>
        )}
        {label}
      </p>
      {title && <Title className="font-medium text-foreground">{title}</Title>}
      {children && <div className="text-muted-foreground [&_p]:max-w-[68ch]">{children}</div>}
      {action && <div className="absolute top-2 right-2">{action}</div>}
    </div>
  );
}
