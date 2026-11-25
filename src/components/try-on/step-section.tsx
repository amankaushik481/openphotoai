import * as React from "react";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StepSectionProps {
  step: number;
  title: string;
  description?: React.ReactNode;
  done?: boolean;
  className?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

/** One step of the try-on flow: a studio panel with a mono step number ("01", or a tick when done). */
export function StepSection({ step, title, description, done = false, className, children, ref }: StepSectionProps) {
  const headingId = React.useId();
  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4 border border-foreground/15 bg-card p-4 sm:p-5", className)}
    >
      <header className="flex items-start gap-3 border-b border-dashed border-foreground/20 pb-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-7 min-w-9 shrink-0 items-center justify-center border font-mono text-xs tabular-nums",
            done ? "border-success/50 text-success" : "border-safelight-ink/60 text-safelight-ink",
          )}
        >
          {done ? <CheckIcon className="size-4" /> : String(step).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} tabIndex={-1} className="font-display text-2xl leading-none tracking-tight focus:outline-hidden">
            <span className="sr-only">{`Step ${step}${done ? " (done)" : ""}: `}</span>
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
