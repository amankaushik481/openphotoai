import Link from "next/link";

import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/** Brand mark: a lens ring + AI sparkle on the brand gradient. Decorative (name is rendered as text). */
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
        <circle cx="14" cy="18" r="6.5" stroke="white" strokeWidth="3" />
        <path d="M23.5 3.5C23.95 7.1 24.9 8.05 28.5 8.5C24.9 8.95 23.95 9.9 23.5 13.5C23.05 9.9 22.1 8.95 18.5 8.5C22.1 8.05 23.05 7.1 23.5 3.5Z" fill="white" />
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
