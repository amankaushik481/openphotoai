import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { GithubIcon } from "@/components/layout/icons";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MarketingMobileNav } from "@/components/layout/marketing-mobile-nav";
import { MARKETING_LINKS } from "@/components/layout/marketing-nav";
import { MarketingNavLinks } from "@/components/layout/marketing-nav-links";
import { t } from "@/i18n";

/** Plain text links; the current section gets a safelight underline. */
const linkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[14.5px] font-medium text-muted-foreground decoration-safelight-ink decoration-2 underline-offset-[7px] transition-colors hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:underline";

/** Static (no session read) so marketing pages stay statically rendered. */
export function MarketingHeader() {
  const internal = MARKETING_LINKS.filter((l) => !l.external).map((l) => ({ href: l.href, label: t(l.labelKey) }));
  const external = MARKETING_LINKS.filter((l) => l.external);
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-8 lg:px-12">
        <Logo />
        <nav aria-label={t("nav.mainNavigation")} className="ml-6 hidden items-center md:flex lg:ml-10">
          {/* Marks the current section (aria-current); the rest of the header stays server-rendered. */}
          <MarketingNavLinks links={internal} className={linkClass} />
          {external.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <GithubIcon className="size-4" />
              {t(link.labelKey)}
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-sm px-1 text-[14.5px] font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink sm:inline-flex"
          >
            {t("nav.signIn")}
          </Link>
          <Button asChild variant="brand" size="sm" className="h-9 rounded-[3px] px-4 text-[14px]">
            <Link href="/app">{t("nav.getStarted")}</Link>
          </Button>
          <MarketingMobileNav />
        </div>
      </div>
    </header>
  );
}
