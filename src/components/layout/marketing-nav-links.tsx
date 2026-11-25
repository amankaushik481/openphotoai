"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** True when `pathname` is `href` or a page below it (`/packs/paris` is under `/packs`). */
export function isCurrentPath(pathname: string | null, href: string): boolean {
  if (!pathname || !href.startsWith("/")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Internal links of the marketing header, marked `aria-current="page"` for the section being viewed.
 * Labels and classes are resolved by the (server) header, so this island only ships the path check.
 */
export function MarketingNavLinks({
  links,
  className,
}: {
  links: { href: string; label: string }[];
  className: string;
}) {
  const pathname = usePathname();
  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className={className}
      aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}
    >
      {link.label}
    </Link>
  ));
}
