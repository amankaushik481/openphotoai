"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV, isNavActive } from "@/components/layout/app-nav";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav aria-label={t("admin.title")} className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Inset focus outline: the scrolling nav would clip an outer one.
                  "inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors [--focus-offset:-2px]",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
