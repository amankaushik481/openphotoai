import Link from "next/link";

import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/** Viewfinder crop-mark corners (32-unit grid), shared with the icon files in `src/app` and `public/brand`. */
export const LOGO_BRACKETS = "M3.5 11V3.5H11M21 3.5h7.5V11M28.5 21v7.5H21M11 28.5H3.5V21";

/**
 * Brand mark: viewfinder crop marks in ink around a safelight focus point. Decorative (the name is rendered
 * as text); inherits `currentColor` for the brackets.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("size-7 shrink-0 overflow-visible", className)}
    >
      <path d={LOGO_BRACKETS} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      <circle cx="16" cy="16" r="4" className="fill-safelight-ink" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  showName = true,
}: {
  href?: string;
  className?: string;
  showName?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={showName ? undefined : APP.name}
      className={cn("inline-flex items-center gap-2.5 rounded-sm text-foreground", className)}
    >
      <LogoMark className="size-6" />
      {showName && <span className="font-display text-[1.55rem] leading-none tracking-[-0.01em]">{APP.name}</span>}
    </Link>
  );
}
