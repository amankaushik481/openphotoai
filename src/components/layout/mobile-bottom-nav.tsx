"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisIcon } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ADMIN_LINK,
  MOBILE_CREATE_NAV,
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
  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xs pt-2 pb-1.5 font-mono text-[0.625rem] leading-4 tracking-[0.1em] uppercase transition-colors [--focus-offset:-2px]";

/** Safelight tick on the bar's top hairline above the current tab. */
function ActiveTick({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2", active ? "bg-safelight-ink" : "bg-transparent")}
    />
  );
}

/**
 * Phone navigation: a calm paper bar with mono labels, the current tab marked by a safelight tick, and a
 * raised safelight shutter button for Create in the middle.
 */
export function MobileBottomNav({ isAdmin, className }: { isAdmin: boolean; className?: string }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const more = isAdmin ? [...MOBILE_MORE_NAV, ADMIN_LINK] : MOBILE_MORE_NAV;
  const moreActive = more.some((item) => isNavActive(pathname, item));
  const navRef = React.useRef<HTMLElement>(null);
  // Sticky bars, page padding and scroll-padding stack on top of the real bar height (--bottom-nav-h).
  useBottomChromeHeight(navRef, "--bottom-nav-h");
  const [left, right] = [MOBILE_PRIMARY_NAV.slice(0, 2), MOBILE_PRIMARY_NAV.slice(2)];

  return (
    <nav
      ref={navRef}
      data-bottom-nav=""
      aria-label={t("nav.mainNavigation")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-background/95 pb-safe supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-md",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        {left.map((item) => (
          <li key={item.href} className="flex flex-1">
            <TabLink item={item} active={isNavActive(pathname, item)} label={t(item.labelKey)} />
          </li>
        ))}
        <li className="flex flex-1 justify-center">
          <ShutterLink
            item={MOBILE_CREATE_NAV}
            active={isNavActive(pathname, MOBILE_CREATE_NAV)}
            label={t(MOBILE_CREATE_NAV.labelKey)}
          />
        </li>
        {right.map((item) => (
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
              <ActiveTick active={moreActive} />
              <EllipsisIcon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t("nav.more")}
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader className="border-b border-border px-5 pb-3">
                <p aria-hidden="true" className="mono-caps text-muted-foreground">
                  Index
                </p>
                <SheetTitle>{t("nav.more")}</SheetTitle>
                <SheetDescription className="sr-only">{t("nav.mainNavigation")}</SheetDescription>
              </SheetHeader>
              {/* An editorial index: numbered plain-text rows on hairlines, two columns. */}
              <ul className="grid grid-cols-2 gap-x-5 px-5 pb-4">
                {more.map((item, i) => {
                  const Icon = item.icon;
                  const active = isNavActive(pathname, item);
                  return (
                    <li key={item.href} className="border-b border-border">
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 items-center gap-3 rounded-xs text-[0.9375rem] transition-colors [--focus-offset:-2px]",
                          active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "w-5 font-mono text-[0.625rem] tracking-[0.1em]",
                            active ? "text-safelight-ink" : "text-foreground/45",
                          )}
                        >
                          {active ? "▸" : String(i + 1).padStart(2, "0")}
                        </span>
                        <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                        <span className="min-w-0 truncate">{t(item.labelKey)}</span>
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
      <ActiveTick active={active} />
      <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

/**
 * The shutter release: a raised safelight disc with an aperture glyph. It drops back into the bar while a
 * sticky action bar (e.g. Generate) sits right above it.
 */
function ShutterLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group flex min-w-0 flex-col items-center justify-end gap-1 rounded-xs pb-1.5 font-mono text-[0.625rem] leading-4 tracking-[0.1em] text-foreground uppercase"
    >
      <span
        aria-hidden="true"
        className={cn(
          "-mt-4 flex size-12 items-center justify-center rounded-full bg-safelight text-white ring-4 ring-background transition-[filter,margin] group-hover:brightness-110 group-active:brightness-95 dark:shadow-[0_0_22px_-6px_var(--safelight)] [html:has([data-sticky-action-bar])_&]:mt-1 [html:has([data-sticky-action-bar])_&]:size-10",
          active && "outline-2 outline-offset-2 outline-safelight-ink",
        )}
      >
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      {label}
    </Link>
  );
}
