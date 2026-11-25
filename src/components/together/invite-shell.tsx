import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";

/** Centered, mobile-first frame for the invite page (outside the app shell). */
export function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative isolate flex min-h-dvh flex-1 flex-col items-center px-4 pt-12 pb-10 sm:pt-16">
      <Logo className="mb-8" />
      <main id="main" className="w-full max-w-lg">
        {children}
      </main>
    </div>
  );
}
