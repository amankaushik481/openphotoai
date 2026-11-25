import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // A hairline box on paper: the field is a little lighter than the page, like a form printed on card.
        "h-9 w-full min-w-0 rounded-xs border border-input bg-card/70 px-3 py-1 text-base transition-[color,border-color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-foreground/[0.03]",
        // Solid safelight `border-ring` plus a 1px inner line is the indicator (≥ 5:1); the outline is dropped
        // except in forced colors.
        "focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] focus-visible:outline-hidden",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
