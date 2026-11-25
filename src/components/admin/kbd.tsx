import { cn } from "@/lib/utils";

/** Keyboard-shortcut hint inside a button. Hidden on touch screens; `aria-keyshortcuts` carries it for AT. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "ml-0.5 hidden min-w-5 items-center justify-center rounded border border-current/25 px-1 font-mono text-[10px] leading-4 font-medium opacity-70 pointer-fine:inline-flex",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
