import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { GithubIcon } from "@/components/layout/icons";
import { LEGAL_LINKS } from "@/components/layout/marketing-nav";
import { APP } from "@/config/app";
import { t } from "@/i18n";

const PRODUCT_LINKS = [
  { href: "/packs", label: t("nav.packs") },
  { href: "/pricing", label: t("nav.pricing") },
  { href: "/faq", label: t("nav.faq") },
  { href: "/docs/api", label: t("nav.api") },
];

const linkClass =
  "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="render-lazy border-t border-border/70 [--render-size:570px] md:[--render-size:300px]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{APP.tagline}</p>
        </div>
        <FooterColumn title={t("nav.product")}>
          {PRODUCT_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </FooterColumn>
        <FooterColumn title={t("nav.legal")}>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {t(l.labelKey)}
            </Link>
          ))}
        </FooterColumn>
        <FooterColumn title={t("nav.resources")}>
          <a href={APP.githubUrl} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1.5`}>
            <GithubIcon className="size-4" />
            {t("nav.github")}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <span className="text-sm text-muted-foreground">{t("app.openSource")}</span>
          <a href={`mailto:${APP.supportEmail}`} className={linkClass}>
            {APP.supportEmail}
          </a>
        </FooterColumn>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {APP.legalEntity}. {t("app.openSource")}.
          </p>
          <p>{t("app.madeWith")}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h2>
      <div className="flex flex-col items-start gap-2.5">{children}</div>
    </div>
  );
}
