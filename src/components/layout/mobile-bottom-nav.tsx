"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisIcon } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ADMIN_LINK,
  MOBILE_MORE_NAV,
  MOBILE_PRIMARY_NAV,
  isNavActive,
  type NavItem,
} from "@/components/layout/app-nav";
import { useBottomChromeHeight } from "@/components/layout/use-bottom-chrome";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

// rem-sized label (not px) so the bar scales with the user's text size; its height is measured below.
const tabClass =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[0.6875rem] leading-4 font-medium transition-colors";

export function MobileBottomNav({ isAdmin, className }: { isAdmin: boolean; className?: string }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const more = isAdmin ? [...MOBILE_MORE_NAV, ADMIN_LINK] : MOBILE_MORE_NAV;
  const moreActive = more.some((item) => isNavActive(pathname, item));
  const navRef = React.useRef<HTMLElement>(null);
  // Sticky bars, page padding and scroll-padding stack on top of the real bar height (--bottom-nav-h).
  useBottomChromeHeight(navRef, "--bottom-nav-h");

  return (
    <nav
      ref={navRef}
      data-bottom-nav=""
      aria-label={t("nav.mainNavigation")}
      className={cn("glass fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-safe", className)}
    >
      <ul className="mx-auto flex max-w-lg items-stretch gap-1 pt-1.5 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        {MOBILE_PRIMARY_NAV.map((item) => (
          <li key={item.href} className="flex flex-1">
            <TabLink item={item} active={isNavActive(pathname, item)} label={t(item.labelKey)} />
          </li>
        ))}
        <li className="flex flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={cn(tabClass, moreActive ? "text-foreground" : "text-muted-foreground")}
              aria-current={moreActive ? "page" : undefined}
            >
              <EllipsisIcon aria-hidden="true" className={cn("size-5", moreActive && "text-primary")} />
              {t("nav.more")}
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>{t("nav.more")}</SheetTitle>
                <SheetDescription className="sr-only">{t("nav.mainNavigation")}</SheetDescription>
              </SheetHeader>
              <ul className="grid grid-cols-3 gap-2 px-4 pb-4">
                {more.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-xs font-medium transition-colors",
                          active ? "border-primary/40 bg-brand-soft text-brand-soft-foreground" : "bg-card hover:bg-accent",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                        {t(item.labelKey)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

function TabLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(tabClass, active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      <Icon aria-hidden="true" className={cn("size-5", active && "text-primary")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
