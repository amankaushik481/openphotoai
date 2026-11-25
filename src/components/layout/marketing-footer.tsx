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

const SHELL = "mx-auto w-full max-w-[90rem] px-4 sm:px-8 lg:px-12";
const linkClass =
  "inline-flex min-h-8 items-center rounded-sm text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground";

/**
 * The end of the roll: link columns, a strip of film rebate as the rule, and the wordmark set huge and
 * cropped by the page's bottom edge.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="render-lazy overflow-hidden border-t border-border [--render-size:820px] md:[--render-size:640px]">
      <div
        className={`${SHELL} grid grid-cols-2 gap-x-6 gap-y-12 py-16 sm:grid-cols-3 lg:grid-cols-12 lg:gap-x-10 lg:py-20`}
      >
        <div className="col-span-2 flex flex-col items-start gap-4 sm:col-span-3 lg:col-span-5">
          <Logo />
          <p className="max-w-[22rem] text-[0.9375rem] leading-relaxed text-muted-foreground">{APP.tagline}</p>
        </div>
        <FooterColumn title={t("nav.product")} className="lg:col-span-2 lg:col-start-7">
          {PRODUCT_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </FooterColumn>
        <FooterColumn title={t("nav.legal")} className="lg:col-span-2">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {t(l.labelKey)}
            </Link>
          ))}
        </FooterColumn>
        <FooterColumn title={t("nav.resources")} className="col-span-2 sm:col-span-1 lg:col-span-2">
          <a href={APP.githubUrl} target="_blank" rel="noopener noreferrer" className={`${linkClass} gap-1.5`}>
            <GithubIcon className="size-4" />
            {t("nav.github")}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <Link href="/docs" className={linkClass}>
            Self-hosting docs
          </Link>
          <a href={`mailto:${APP.supportEmail}`} className={`${linkClass} break-all`}>
            {APP.supportEmail}
          </a>
        </FooterColumn>
      </div>

      {/* Film rebate as the rule: perforations and edge print. */}
      <div aria-hidden="true" className="film overflow-hidden [--hole:5px] [--pitch:13px] [--rebate:11px]">
        <p className="flex gap-10 overflow-hidden py-1 font-mono text-[9px] leading-none tracking-[0.18em] whitespace-nowrap uppercase">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>
              {APP.name} 400 · Safety film · ▸ {29 + i} · {29 + i}A
            </span>
          ))}
        </p>
      </div>

      <div
        className={`${SHELL} flex flex-col gap-2 pt-6 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between`}
      >
        <p>
          © {year} {APP.legalEntity}. {t("app.openSource")}.
        </p>
        <p>{t("app.madeWith")}</p>
      </div>
      <p
        aria-hidden="true"
        className="mt-6 -mb-[0.24em] px-2 text-center font-display text-[24vw] leading-[0.8] tracking-[-0.05em] text-foreground select-none"
      >
        {APP.name}
      </p>
    </footer>
  );
}

function FooterColumn({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <h2 className="mono-caps text-[0.625rem] text-foreground">{title}</h2>
      <div className="flex flex-col items-start gap-1">{children}</div>
    </div>
  );
}
