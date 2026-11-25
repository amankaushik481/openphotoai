import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Account pages (settings, team, API keys) as clean editorial forms: each "card" is a section of the page
 * set off by a hairline rule, with its title in the serif, instead of a boxed card. Same API as
 * `@/components/ui/card`, so a card component switches look by changing its import.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-5 border-t border-foreground/20 pt-5 pb-2 text-card-foreground", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:border-foreground/15 [.border-b]:pb-5",
        className,
      )}
      {...props}
    />
  );
}

type CardTitleElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div";

/** A section heading in the serif: `h2` by default; pass `as` to fit the page outline. */
function CardTitle({
  as: Comp = "h2",
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: CardTitleElement; ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <Comp
      data-slot="card-title"
      className={cn("font-display text-3xl leading-none font-normal tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-description" className={cn("max-w-[62ch] text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center [.border-t]:border-dashed [.border-t]:border-foreground/20 [.border-t]:pt-4", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
