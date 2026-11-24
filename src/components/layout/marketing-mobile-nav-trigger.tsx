"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { MenuIcon } from "lucide-react";

const loadSheet = () => import("@/components/layout/marketing-mobile-nav-sheet");
const MarketingMobileNavSheet = dynamic(() => loadSheet().then((m) => m.MarketingMobileNavSheet), { ssr: false });

/**
 * Client half of `MarketingMobileNav` (use that one). The sheet (Radix Dialog) is fetched when the
 * button is hovered, focused or pressed, and mounted on the first click.
 */
export function MarketingMobileNavTrigger({ className, label }: { className: string; label: string }) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const prefetch = () => void loadSheet();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-slot="button"
        data-variant="ghost"
        data-size="icon"
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        onPointerEnter={prefetch}
        onPointerDown={prefetch}
        onFocus={prefetch}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <MenuIcon className="size-5" />
      </button>
      {mounted && <MarketingMobileNavSheet open={open} onOpenChange={setOpen} triggerRef={triggerRef} />}
    </>
  );
}
