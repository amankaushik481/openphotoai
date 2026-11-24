"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { GithubIcon } from "@/components/layout/icons";
import { LogoMark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MARKETING_LINKS } from "@/components/layout/marketing-nav";
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
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[85%] max-w-xs"
        // No Radix <SheetTrigger>: return focus to our own trigger button on close.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <LogoMark className="size-6" />
            <span className="font-display text-xl font-normal">{APP.name}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t("nav.mainNavigation")}</SheetDescription>
        </SheetHeader>
        <nav aria-label={t("nav.mainNavigation")} className="flex flex-col gap-1 px-2">
          {MARKETING_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="flex h-11 items-center gap-2 rounded-md px-3 text-base font-medium hover:bg-accent"
              >
                <GithubIcon className="size-4" />
                {t(link.labelKey)}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="flex h-11 items-center rounded-md px-3 text-base font-medium hover:bg-accent"
              >
                {t(link.labelKey)}
              </Link>
            ),
          )}
        </nav>
        <Separator />
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Button asChild variant="brand" size="lg" onClick={close}>
            <Link href="/app">{t("nav.getStarted")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" onClick={close}>
            <Link href="/login">{t("nav.signIn")}</Link>
          </Button>
          <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
            <span>{t("user.theme")}</span>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
