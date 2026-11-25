import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Where people most likely meant to go. */
const SUGGESTIONS = [
  { href: "/packs", label: "Photo packs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Self-hosting docs" },
];

export default function NotFound() {
  return (
    <main
      id="main"
      className="grain relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12 text-center"
    >
      <Logo className="mb-12" />
      <p className="font-display text-8xl leading-none text-brand-gradient italic sm:text-9xl">404</p>
      <p className="mt-3 mono-caps text-muted-foreground">Frame missing · not on this roll</p>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">{t("pages.notFoundTitle")}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        {t("pages.notFoundBody")} If you followed a link, it may have a typo or be out of date.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild variant="brand" size="lg">
          <Link href="/">{t("common.goHome")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app">{t("common.openApp")}</Link>
        </Button>
      </div>
      <nav aria-label="Popular pages" className="mt-10">
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {SUGGESTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="inline-flex min-h-11 items-center rounded-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-primary sm:min-h-0"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
