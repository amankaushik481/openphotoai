import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { GithubIcon } from "@/components/layout/icons";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MarketingMobileNav } from "@/components/layout/marketing-mobile-nav";
import { MARKETING_LINKS } from "@/components/layout/marketing-nav";
import { t } from "@/i18n";

const linkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Static (no session read) so marketing pages stay statically rendered. */
export function MarketingHeader() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label={t("nav.mainNavigation")} className="ml-4 hidden items-center md:flex">
          {MARKETING_LINKS.map((link) =>
            link.external ? (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <GithubIcon className="size-4" />
                {t(link.labelKey)}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={linkClass}>
                {t(link.labelKey)}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t("nav.signIn")}</Link>
          </Button>
          <Button asChild variant="brand" size="sm">
            <Link href="/app">{t("nav.getStarted")}</Link>
          </Button>
          <MarketingMobileNav />
        </div>
      </div>
    </header>
  );
}
