"use client";

import { usePathname } from "next/navigation";

import { ADMIN_LINK, APP_NAV_GROUPS, isNavActive } from "@/components/layout/app-nav";
import { useT } from "@/i18n/react";

/** The topbar's running head: "02 / STUDIO — VIDEO", like a folio line in a photo magazine. Decorative. */
export function AppFolio() {
  const pathname = usePathname();
  const t = useT();
  const groupIndex = APP_NAV_GROUPS.findIndex((g) => g.items.some((item) => isNavActive(pathname, item)));
  const group = APP_NAV_GROUPS[groupIndex];
  const item = group?.items.find((i) => isNavActive(pathname, i));
  const admin = !item && isNavActive(pathname, ADMIN_LINK);
  if (!item && !admin) return null;

  return (
    <p aria-hidden="true" className="mono-caps hidden items-center gap-2 text-muted-foreground md:flex">
      <span className="text-foreground/45">{group ? String(groupIndex + 1).padStart(2, "0") : "00"}</span>
      <span>{group ? t(group.labelKey) : t(ADMIN_LINK.labelKey)}</span>
      {item && (
        <>
          <span className="h-px w-6 bg-current opacity-40" />
          <span className="text-foreground">{t(item.labelKey)}</span>
        </>
      )}
    </p>
  );
}
