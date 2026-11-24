import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="grain relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gradient opacity-15 blur-3xl"
      />
      <Logo className="mb-12" />
      <p className="font-display text-8xl leading-none text-brand-gradient sm:text-9xl">404</p>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">{t("pages.notFoundTitle")}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{t("pages.notFoundBody")}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="brand" size="lg">
          <Link href="/">{t("common.goHome")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app">{t("common.openApp")}</Link>
        </Button>
      </div>
    </main>
  );
}
