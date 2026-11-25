import { cn } from "@/lib/utils";
import { frameNumber } from "./marks";

/**
 * An empty contact sheet: a strip of unexposed, dashed frames with a lab note under it. Used where a list of
 * prints is empty (gallery, folders, filters, batches).
 */
export function EmptySheet({
  title,
  description,
  action,
  label = "Unexposed",
  frames = 4,
  headingLevel = 2,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Mono label printed in the first frame. */
  label?: string;
  frames?: number;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-col gap-6 border-t border-foreground/15 pt-6 sm:pt-8", className)}>
      <ol aria-hidden="true" className="grid max-w-xl grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: frames }, (_, i) => (
          <li key={i} className={cn(i >= 3 && "max-sm:hidden")}>
            <div className="border border-dashed border-foreground/25 p-1.5 pb-0">
              <div className="flex aspect-[4/5] items-end bg-muted/50 p-1.5">
                {i === 0 && <span className="mono-caps text-[9px] text-muted-foreground">{label}</span>}
              </div>
              <div className="flex h-7 items-center font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
                ▸ {frameNumber(i)}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex max-w-xl flex-col gap-2">
        <Heading
          className={cn(
            "font-display leading-none tracking-tight",
            headingLevel === 2 ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </Heading>
        {description && <p className="max-w-[60ch] text-sm text-muted-foreground sm:text-base">{description}</p>}
        {action && <div className="mt-3 flex flex-wrap items-center gap-3">{action}</div>}
      </div>
    </div>
  );
}
