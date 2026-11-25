"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DemoUserBannerProps {
  /** Cookie remembering the dismissal; the server layout reads it so the banner doesn't flash back. */
  cookieName: string;
  /** How long demo accounts live (hours). */
  ttlHours: number;
}

/** App-shell notice for demo accounts. Dismissible for the rest of the account's life. */
export function DemoUserBanner({ cookieName, ttlHours }: DemoUserBannerProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  function dismiss() {
    document.cookie = `${cookieName}=1; path=/; max-age=${ttlHours * 3600}; samesite=lax`;
    setOpen(false);
  }

  return (
    <div
      role="status"
      data-testid="demo-user-banner"
      className="flex items-center gap-3 border-b border-darkroom-line bg-darkroom py-1.5 pr-2 pl-4 text-sm text-darkroom-foreground sm:pl-6 lg:pl-8"
    >
      {/* Darkroom band: a lab label for a throwaway roll. */}
      <span aria-hidden="true" className="flex shrink-0 items-center gap-2 font-mono text-[0.625rem] tracking-[0.18em] text-darkroom-safelight uppercase">
        <span className="size-1.5 rounded-full bg-darkroom-safelight shadow-[0_0_8px_var(--darkroom-safelight)]" />
        <span className="hidden sm:inline">Demo roll</span>
      </span>
      <p className="min-w-0 flex-1 text-darkroom-muted">
        <strong className="font-medium text-darkroom-foreground">You&apos;re in a demo</strong>
        <span aria-hidden> — </span>
        <span className="sr-only">: </span>
        data is deleted after {ttlHours}h.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Dismiss demo notice"
        className="text-darkroom-muted hover:bg-white/10 hover:text-darkroom-foreground"
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}
