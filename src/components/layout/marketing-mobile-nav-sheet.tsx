"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GithubIcon } from "@/components/layout/icons";
import { LogoMark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MARKETING_LINKS } from "@/components/layout/marketing-nav";
import { isCurrentPath } from "@/components/layout/marketing-nav-links";
import { APP } from "@/config/app";
import { useT } from "@/i18n/react";

/** The marketing mobile menu, loaded on demand by `MarketingMobileNavTrigger` (which owns the trigger). */
export function MarketingMobileNavSheet({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const pathname = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[88%] max-w-sm"
        // Radix skips links when picking the first element to focus, which landed on the theme toggle at the
        // bottom. Start at the first menu link instead.
        onOpenAutoFocus={(event) => {
          const first = navRef.current?.querySelector<HTMLElement>("a[href]");
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
        // No Radix <SheetTrigger>: return focus to our own trigger button on close.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <LogoMark className="size-6" />
            <span className="font-display text-[1.45rem] font-normal">{APP.name}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t("nav.mainNavigation")}</SheetDescription>
        </SheetHeader>
        <nav ref={navRef} aria-label={t("nav.mainNavigation")} className="flex flex-col px-5">
          {MARKETING_LINKS.map((link, i) => {
            const no = (
              <span aria-hidden="true" className="mono-caps w-8 shrink-0 text-muted-foreground not-italic">
                {String(i + 1).padStart(2, "0")}
              </span>
            );
            const row =
              "flex min-h-14 items-baseline gap-2 border-b border-border py-3 font-display text-[1.875rem] leading-none tracking-[-0.01em] aria-[current=page]:italic";
            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className={row}
              >
                {no}
                <span className="flex items-center gap-2">
                  {t(link.labelKey)}
                  <GithubIcon className="size-4 self-center" />
                </span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}
                className={row}
              >
                {no}
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-5 pb-6">
          <Button asChild variant="brand" size="lg" onClick={close} className="h-12 rounded-[3px]">
            <Link href="/app">{t("nav.getStarted")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" onClick={close} className="h-12 rounded-[3px]">
            <Link href="/login">{t("nav.signIn")}</Link>
          </Button>
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
            <span className="mono-caps">{t("user.theme")}</span>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
