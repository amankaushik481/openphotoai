"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { GithubIcon } from "@/components/layout/icons";
import { ADMIN_LINK, APP_NAV_GROUPS, isNavActive, type NavItem } from "@/components/layout/app-nav";
import { APP } from "@/config/app";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

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
      <div className="flex h-16 items-center px-5">
        <Logo href="/app" />
      </div>
      <nav aria-label={t("nav.mainNavigation")} className="flex-1 overflow-y-auto px-3 pb-4">
        {APP_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="mt-4 first:mt-1">
            <p
              id={`nav-group-${group.labelKey.replace(/\W+/g, "-")}`}
              className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {t(group.labelKey)}
            </p>
            <ul aria-labelledby={`nav-group-${group.labelKey.replace(/\W+/g, "-")}`} className="flex flex-col gap-0.5">
              {group.items.map((nav) => (
                <li key={nav.href}>
                  <SidebarLink item={nav} active={isNavActive(pathname, nav)} label={t(nav.labelKey)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {isAdmin && (
          <ul className="mt-4 border-t border-sidebar-border pt-4">
            <li>
              <SidebarLink item={ADMIN_LINK} active={isNavActive(pathname, ADMIN_LINK)} label={t(ADMIN_LINK.labelKey)} />
            </li>
          </ul>
        )}
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4">
        <a
          href={APP.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
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
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
      />
      {label}
    </Link>
  );
}
