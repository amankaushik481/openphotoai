import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xs border border-input bg-card/70 px-3 py-2 text-base transition-[color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-foreground/[0.03] dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
