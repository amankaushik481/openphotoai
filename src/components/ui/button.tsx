import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Darkroom buttons: square-ish (2px), flat, no drop shadows.
 *  - `brand` is the one safelight action on a screen (Generate, Create, Continue).
 *  - `default` is solid ink, for primary actions where safelight would compete.
 *  - `outline` is an ink outline on paper; `secondary` a darker paper tint; `ghost` text only.
 *  - `link` is an underlined text link with a generous offset.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,filter] select-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88 active:bg-primary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive",
        outline:
          "border border-foreground/55 bg-transparent text-foreground hover:border-foreground hover:bg-foreground/[0.05] active:bg-foreground/[0.09] dark:border-foreground/45 dark:hover:border-foreground/80 dark:hover:bg-foreground/[0.07]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-foreground/[0.08]",
        link: "text-foreground underline decoration-foreground/35 decoration-1 underline-offset-[5px] hover:decoration-safelight-ink",
        // Solid safelight; in the dark it glows faintly, like the lamp it's named after.
        brand:
          "bg-brand-gradient font-semibold tracking-[0.005em] text-white hover:brightness-110 active:brightness-95 dark:shadow-[0_0_28px_-8px_var(--safelight)]",
      },
      // Touch screens: text buttons grow toward the 44px target; icon buttons keep their visual size
      // but get an invisible hit area (`after:`) so dense toolbars don't reflow.
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:h-11",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:h-10",
        lg: "h-11 px-6 text-base has-[>svg]:px-5",
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
