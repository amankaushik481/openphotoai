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

/** A numbered card for one step of the try-on flow. */
export function StepSection({ step, title, description, done = false, className, children, ref }: StepSectionProps) {
  const headingId = React.useId();
  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6", className)}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            done ? "bg-success text-success-foreground" : "bg-brand-soft text-brand-soft-foreground",
          )}
        >
          {done ? <CheckIcon className="size-4" /> : step}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} tabIndex={-1} className="font-semibold focus:outline-hidden">
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
