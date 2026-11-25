import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xs border border-l-2 px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-l-foreground/60 bg-card text-card-foreground",
        destructive:
          "border-destructive/35 border-l-destructive bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
        success: "border-success/35 border-l-success bg-success/5 text-foreground [&>svg]:text-success",
        warning: "border-warning/40 border-l-warning bg-warning/5 text-foreground [&>svg]:text-warning",
        brand: "border-safelight-ink/35 border-l-safelight-ink bg-card text-foreground [&>svg]:text-safelight-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  // No implicit role: static notices aren't announced. Pass `role="alert"` for errors inserted at runtime.
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 min-h-4 font-medium tracking-tight break-words", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
