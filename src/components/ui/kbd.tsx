import { cn } from "@/lib/utils";

/** A keyboard key, e.g. `<Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>`. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-foreground/20 bg-card px-1 font-mono text-[0.6875rem] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
