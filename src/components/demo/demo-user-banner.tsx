"use client";

import { FlaskConical, XIcon } from "lucide-react";
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
      className="flex items-center gap-3 border-b border-primary/25 bg-primary/10 py-2 pr-2 pl-4 text-sm text-foreground"
    >
      <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="flex-1">
        <strong className="font-semibold">You&apos;re in a demo</strong>
        <span aria-hidden> — </span>
        <span className="sr-only">: </span>
        data is deleted after {ttlHours}h.
      </p>
      <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss demo notice">
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}
