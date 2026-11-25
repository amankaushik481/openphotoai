import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Lab-label status chips: mono uppercase with wide tracking, square corners, hairline outlines.
 * Use darkroom vocabulary in the text (DEVELOPING, READY, FAILED · REFUNDED). The uppercase is CSS only,
 * so the accessible text (and what tests match) keeps its natural case.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xs border px-1.5 py-[0.1875rem] font-mono text-[0.6875rem] leading-none font-medium tracking-[0.12em] whitespace-nowrap uppercase tabular-nums transition-[color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-border bg-secondary text-secondary-foreground [a&]:hover:bg-accent",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground focus-visible:outline-destructive [a&]:hover:bg-destructive/90",
        outline: "border-foreground/30 text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        brand: "border-transparent bg-brand-gradient text-white",
        // Safelight ink on paper: a grease-pencil note, not a pastel pill.
        soft: "border-safelight-ink/45 bg-transparent text-safelight-ink",
        success: "border-success/45 bg-transparent text-success",
        warning: "border-warning/50 bg-transparent text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
