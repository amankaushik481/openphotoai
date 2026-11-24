import Link from "next/link";

import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/** Brand mark: a lens ring + flash dot on the brand gradient. Decorative (name is rendered as text). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-gradient shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-full">
        <circle cx="16" cy="16.5" r="7" stroke="white" strokeWidth="3" />
        <circle cx="23.75" cy="8.25" r="2" fill="white" />
      </svg>
    </span>
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
      className={cn(
        "inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <LogoMark />
      {showName && <span className="font-display text-[1.45rem] leading-none tracking-tight">{APP.name}</span>}
    </Link>
  );
}
