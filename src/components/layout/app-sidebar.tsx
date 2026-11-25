"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CreditBadge } from "@/components/app/credit-badge";
import { Logo } from "@/components/layout/logo";
import { GithubIcon } from "@/components/layout/icons";
import { ADMIN_LINK, APP_NAV_GROUPS, isNavActive, type NavItem } from "@/components/layout/app-nav";
import { APP } from "@/config/app";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/**
 * The workstation's left rail: serif wordmark, a mono-folio index of plain text links (the current one
 * gets a safelight tick, not a filled pill) and the credit balance as a light-meter readout.
 */
export function AppSidebar({ isAdmin, className }: { isAdmin: boolean; className?: string }) {
  const pathname = usePathname();
  const t = useT();

  // A plain container, not <aside>: the primary navigation isn't complementary content.
  return (
    <div
      className={cn(
        "sticky top-0 h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Logo href="/app" />
      </div>
      <nav aria-label={t("nav.mainNavigation")} className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        {APP_NAV_GROUPS.map((group, gi) => {
          const id = `nav-group-${group.labelKey.replace(/\W+/g, "-")}`;
          return (
            <div key={group.labelKey} className="mt-6 first:mt-0">
              <p id={id} className="mono-caps flex items-center gap-2 pb-2 text-muted-foreground">
                <span aria-hidden="true" className="text-foreground/45">
                  {String(gi + 1).padStart(2, "0")}
                </span>
                {t(group.labelKey)}
              </p>
              <ul aria-labelledby={id} className="flex flex-col">
                {group.items.map((nav) => (
                  <li key={nav.href}>
                    <SidebarLink item={nav} active={isNavActive(pathname, nav)} label={t(nav.labelKey)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {isAdmin && (
          <ul className="mt-6 border-t border-sidebar-border pt-4">
            <li>
              <SidebarLink item={ADMIN_LINK} active={isNavActive(pathname, ADMIN_LINK)} label={t(ADMIN_LINK.labelKey)} />
            </li>
          </ul>
        )}
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4">
        <CreditBadge variant="meter" />
      </div>
      <div className="border-t border-sidebar-border px-5 py-3">
        <a
          href={APP.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xs font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <GithubIcon className="size-3.5" />
          {t("app.openSource")}
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}

function SidebarLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative -mx-2 flex h-8 items-center rounded-xs px-2 text-[0.9375rem] transition-colors [--focus-offset:-2px]",
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {/* Safelight tick on the rail for the current page; a hairline one on hover. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -left-3 h-4 w-[3px] -translate-y-1/2 transition-colors",
          active ? "bg-safelight-ink" : "bg-transparent group-hover:bg-foreground/25",
        )}
      />
      {label}
      {active && (
        <span aria-hidden="true" className="ml-auto font-mono text-[0.625rem] text-safelight-ink">
          ▸
        </span>
      )}
    </Link>
  );
}
