import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

/** Centered, mobile-first frame for sign-in and account-status pages. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative isolate flex min-h-dvh flex-1 flex-col items-center px-4 pt-12 pb-10 sm:justify-center sm:pt-10">
      <Logo className="mb-8" />
      <main id="main" className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
