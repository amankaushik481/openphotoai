import {
  ClapperboardIcon,
  CreditCardIcon,
  GaugeIcon,
  ImagesIcon,
  KeyRoundIcon,
  LayersIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PersonStandingIcon,
  ScanFaceIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldIcon,
  ShirtIcon,
  SparklesIcon,
  UsersIcon,
  UsersRoundIcon,
  DollarSignIcon,
  ListChecksIcon,
} from "lucide-react";

import type { TranslationKey } from "@/i18n";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  /** "exact" for index routes (/app, /admin); everything else matches by prefix. */
  match?: "exact" | "prefix";
}

export interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

const item = {
  dashboard: { href: "/app", labelKey: "nav.dashboard", icon: LayoutDashboardIcon, match: "exact" },
  create: { href: "/app/create", labelKey: "nav.create", icon: SparklesIcon },
  packs: { href: "/app/packs", labelKey: "nav.packs", icon: LayersIcon },
  models: { href: "/app/models", labelKey: "nav.models", icon: ScanFaceIcon },
  gallery: { href: "/app/gallery", labelKey: "nav.gallery", icon: ImagesIcon },
  video: { href: "/app/video", labelKey: "nav.video", icon: ClapperboardIcon },
  pose: { href: "/app/pose", labelKey: "nav.pose", icon: PersonStandingIcon },
  tryOn: { href: "/app/try-on", labelKey: "nav.tryOn", icon: ShirtIcon },
  together: { href: "/app/together", labelKey: "nav.together", icon: UsersRoundIcon },
  team: { href: "/app/team", labelKey: "nav.team", icon: UsersIcon },
  billing: { href: "/app/billing", labelKey: "nav.billing", icon: CreditCardIcon },
  apiKeys: { href: "/app/api-keys", labelKey: "nav.apiKeys", icon: KeyRoundIcon },
  settings: { href: "/app/settings", labelKey: "nav.settings", icon: SettingsIcon },
} satisfies Record<string, NavItem>;

export const APP_NAV_ITEMS = item;

export const APP_NAV_GROUPS: NavGroup[] = [
  { labelKey: "nav.groups.create", items: [item.dashboard, item.create, item.packs, item.models, item.gallery] },
  { labelKey: "nav.groups.studio", items: [item.video, item.pose, item.tryOn, item.together] },
  { labelKey: "nav.groups.account", items: [item.team, item.billing, item.apiKeys, item.settings] },
];

export const ADMIN_LINK: NavItem = { href: "/admin", labelKey: "nav.admin", icon: ShieldIcon };

/** Mobile bottom bar (the 5th slot is "More"). */
export const MOBILE_PRIMARY_NAV: NavItem[] = [item.create, item.packs, item.gallery, item.models];

/** Everything else, shown in the mobile "More" sheet. */
export const MOBILE_MORE_NAV: NavItem[] = [
  item.dashboard,
  item.video,
  item.pose,
  item.tryOn,
  item.together,
  item.team,
  item.billing,
  item.apiKeys,
  item.settings,
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", labelKey: "admin.overview", icon: GaugeIcon, match: "exact" },
  { href: "/admin/users", labelKey: "admin.users", icon: UsersIcon },
  { href: "/admin/jobs", labelKey: "admin.jobs", icon: ListChecksIcon },
  { href: "/admin/moderation", labelKey: "admin.moderation", icon: ShieldAlertIcon },
  { href: "/admin/revenue", labelKey: "admin.revenue", icon: DollarSignIcon },
];


export function isNavActive(pathname: string | null, nav: Pick<NavItem, "href" | "match">): boolean {
  if (!pathname) return false;
  if (nav.match === "exact") return pathname === nav.href;
  return pathname === nav.href || pathname.startsWith(`${nav.href}/`);
}
