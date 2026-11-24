import { APP } from "@/config/app";
import type { TranslationKey } from "@/i18n";

export interface MarketingLink {
  href: string;
  labelKey: TranslationKey;
  external?: boolean;
}

export const MARKETING_LINKS: MarketingLink[] = [
  { href: "/packs", labelKey: "nav.packs" },
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/faq", labelKey: "nav.faq" },
  { href: "/docs/api", labelKey: "nav.api" },
  { href: APP.githubUrl, labelKey: "nav.github", external: true },
];

export const LEGAL_LINKS: MarketingLink[] = [
  { href: "/legal/terms", labelKey: "nav.terms" },
  { href: "/legal/privacy", labelKey: "nav.privacy" },
  { href: "/legal/acceptable-use", labelKey: "nav.acceptableUse" },
];
