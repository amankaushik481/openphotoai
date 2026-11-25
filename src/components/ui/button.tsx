import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all select-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:outline-destructive",
        outline:
          "border border-input/60 bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input/70 dark:bg-input/10 dark:hover:bg-input/25",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
        link: "text-primary underline-offset-4 hover:underline",
        // Solid safelight; in the dark it glows faintly, like the lamp it's named after.
        brand:
          "bg-brand-gradient font-semibold text-white hover:brightness-110 active:brightness-95 dark:shadow-[0_0_28px_-8px_var(--safelight)]",
      },
      // Touch screens: text buttons grow toward the 44px target; icon buttons keep their visual size
      // but get an invisible hit area (`after:`) so dense toolbars don't reflow.
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:h-11",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5 pointer-coarse:h-10",
        lg: "h-11 rounded-lg px-6 text-base has-[>svg]:px-4",
        icon: "relative size-9 pointer-coarse:after:absolute pointer-coarse:after:-inset-1",
        "icon-sm": "relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
