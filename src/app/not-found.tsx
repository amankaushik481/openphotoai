import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LostFrame } from "@/components/layout/lost-frame";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Where people most likely meant to go. */
const SUGGESTIONS = [
  { href: "/packs", label: "Photo packs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Self-hosting docs" },
];

/** The lost frame: frame 404 came back blown out to white. */
export default function NotFound() {
  return (
    <AuthShell width="xl" label="Frame 404 · not on this roll">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <figure className="lg:col-span-7">
          <LostFrame variant="overexposed" frame="404" className="shadow-print" />
          <figcaption className="mono-caps mt-4 flex justify-between gap-4 text-muted-foreground">
            <span>▸ 404 · overexposed</span>
            <span>Nothing developed</span>
          </figcaption>
        </figure>
        <div className="lg:col-span-5">
          <p className="mono-caps text-safelight-ink">Error 404 · lost frame</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.92] tracking-[-0.02em] text-balance">
            {t("pages.notFoundTitle")}
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            {t("pages.notFoundBody")} If you followed a link, it may have a typo or be out of date.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="brand" size="lg">
              <Link href="/">{t("common.goHome")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/app">{t("common.openApp")}</Link>
            </Button>
          </div>
          <nav aria-label="Popular pages" className="mt-10">
            <p className="mono-caps pb-2 text-muted-foreground">Try another frame</p>
            <ul className="border-t border-border">
              {SUGGESTIONS.map((s, i) => (
                <li key={s.href} className="border-b border-border">
                  <Link
                    href={s.href}
                    className="group flex min-h-11 items-center gap-3 text-sm transition-colors [--focus-offset:-2px] hover:text-foreground"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="group-hover:underline group-hover:decoration-safelight-ink group-hover:underline-offset-4">
                      {s.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ml-auto text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </AuthShell>
  );
}
