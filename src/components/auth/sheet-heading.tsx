/** Headings for the account "print" sheets. Tiny and hook-free, so client forms can use them too. */
import { cn } from "@/lib/utils";

/** Mono status line over a sheet's title: "LINK EXPIRED", "SIGNED IN"… */
export function SheetKicker({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warning" | "success" | "safelight" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "mono-caps flex items-center gap-2",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-warning",
        tone === "success" && "text-success",
        tone === "safelight" && "text-safelight-ink",
        tone === "destructive" && "text-destructive",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </p>
  );
}

/** The sheet's title, set in the serif. */
export function SheetTitle({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h1
      className={cn("mt-3 font-display text-[2.5rem] leading-[0.95] tracking-[-0.015em] text-balance", className)}
      {...props}
    >
      {children}
    </h1>
  );
}
