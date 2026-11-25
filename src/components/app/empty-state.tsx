import { EdgePrint } from "@/components/ui/darkroom";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** An icon element, e.g. `<ImagesIcon />` (sized automatically; drawn faintly in the first frame). */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action (e.g. a Button). */
  action?: React.ReactNode;
  className?: string;
  size?: "default" | "sm";
}

/** Frame numbers as they'd read on a strip: 1, 1A, 2, 2A… */
const FRAMES = ["1", "1A", "2", "2A", "3", "3A"];

/**
 * Nothing here yet: an unexposed contact sheet. Dashed, empty frames with their edge numbers, then the
 * title in the serif and one next step. `sm` is a single line of three tiny frames for cards and lists.
 */
export function EmptyState({ icon, title, description, action, className, size = "default" }: EmptyStateProps) {
  if (size === "sm") {
    return (
      <div
        className={cn(
          "flex flex-col gap-4 rounded-xs border border-dashed border-foreground/25 px-4 py-5 sm:flex-row sm:items-center",
          className,
        )}
      >
        <div aria-hidden="true" className="flex shrink-0 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="relative flex h-11 w-9 items-center justify-center rounded-[1px] border border-dashed border-foreground/25 text-muted-foreground/70 [&_svg]:size-4"
            >
              {i === 0 ? icon : null}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
          {action && <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grain overflow-hidden rounded-xs border border-dashed border-foreground/25 px-5 py-6 sm:px-8 sm:py-8",
        className,
      )}
    >
      <EdgePrint frame="00" className="mb-5 max-w-xl" />
      <ul aria-hidden="true" className="grid max-w-xl grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
        {FRAMES.map((n, i) => (
          <li key={n} className={cn("flex flex-col gap-1.5", i >= 4 && "hidden sm:flex")}>
            <span className="relative flex aspect-[4/5] items-center justify-center rounded-[1px] border border-dashed border-foreground/25 text-muted-foreground/60 [&_svg]:size-5">
              {i === 0 ? icon : null}
            </span>
            <span className="font-mono text-[0.625rem] leading-none tracking-[0.16em] text-muted-foreground">{n}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex max-w-lg flex-col items-start gap-2">
        <h2 className="font-display text-[1.75rem] leading-[1.05] tracking-[-0.01em] sm:text-3xl">{title}</h2>
        {description && <p className="text-sm text-muted-foreground sm:text-base">{description}</p>}
        {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
