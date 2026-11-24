import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

/** Centered, mobile-first frame for sign-in and account-status pages. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col items-center px-4 pt-12 pb-10 sm:justify-center sm:pt-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-brand-gradient opacity-[0.12] blur-3xl dark:opacity-20"
      />
      <Logo className="mb-8" />
      <main id="main" className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
