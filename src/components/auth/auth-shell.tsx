import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/**
 * Quiet frame for sign-in and account-status pages: the wordmark and a mono running head, the page's
 * sheet in the middle (top-aligned on phones), and an edge-print rule along the bottom.
 */
export function AuthShell({
  children,
  width = "sm",
  label = "The darkroom",
}: {
  children: ReactNode;
  width?: "sm" | "lg";
  /** Mono running head beside the wordmark (wide screens). */
  label?: string;
}) {
  return (
    <div className="grain relative isolate flex min-h-dvh flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 pt-5 sm:px-8 lg:px-12">
        <Logo />
        <p className="mono-caps hidden text-muted-foreground sm:block">{label}</p>
      </header>
      <main
        id="main"
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-4 pt-8 pb-12 sm:justify-center sm:py-14",
          width === "sm" ? "max-w-[27rem]" : "max-w-xl",
        )}
      >
        {children}
      </main>
      <footer aria-hidden="true" className="mx-auto w-full max-w-[90rem] px-4 pb-5 sm:px-8 lg:px-12">
        <div className="mono-caps flex items-center gap-3 text-muted-foreground">
          <span>▸ 00</span>
          <span className="h-px flex-1 bg-border" />
          <span className="hidden sm:inline">OPENSHOOT 400 · SAFETY FILM</span>
          <span className="hidden h-px flex-1 bg-border sm:block" />
          <span>00A</span>
        </div>
      </footer>
    </div>
  );
}
