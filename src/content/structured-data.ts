/** schema.org JSON-LD builders (pure). Rendered by <JsonLd> in components/marketing/json-ld.tsx. */
import { APP } from "@/config/app";
import { PAID_PLAN_IDS, PLANS } from "@/config/plans";
import type { Pack, PackSummary } from "@/types/pack";
import { toPlainText } from "./inline";
import { absoluteUrl, packPath } from "./site";

export type JsonLdObject = { "@context"?: string; "@type": string } & Record<string, unknown>;

const CONTEXT = "https://schema.org";

/**
 * JSON for a <script type="application/ld+json"> tag. `<`, `>` and `&` are escaped as unicode so a
 * string containing "</script>" can never close the tag (JSON.parse restores them unchanged).
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** FAQPage with plain-text answers (inline markup stripped). */
export function buildFaqPageJsonLd(items: readonly FaqEntry[]): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: toPlainText(item.question),
      acceptedAnswer: { "@type": "Answer", text: toPlainText(item.answer) },
    })),
  };
}

export function buildBreadcrumbJsonLd(crumbs: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** ItemList of pack pages for the public gallery. */
export function buildPackListJsonLd(packs: readonly PackSummary[]): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    name: `${APP.name} photo packs`,
    numberOfItems: packs.length,
    itemListElement: packs.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(packPath(p.slug)),
      name: p.name,
    })),
  };
}

/** A pack page: the pack as a CreativeWork whose parts are its shots (an ItemList). */
export function buildPackJsonLd(pack: Pick<Pack, "slug" | "name" | "description" | "tags" | "prompts">): JsonLdObject {
  const url = absoluteUrl(packPath(pack.slug));
  return {
    "@context": CONTEXT,
    "@type": "CreativeWork",
    "@id": url,
    url,
    name: `${pack.name} — AI photo pack`,
    description: pack.description,
    keywords: pack.tags.join(", "),
    isAccessibleForFree: false,
    provider: { "@type": "Organization", name: APP.name, url: APP.url },
    hasPart: {
      "@type": "ItemList",
      name: `${pack.name} shot list`,
      numberOfItems: pack.prompts.length,
      itemListElement: pack.prompts.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title })),
    },
  };
}

/** The product itself, with the plan price range as an AggregateOffer. */
export function buildSoftwareApplicationJsonLd(): JsonLdObject {
  const prices = PAID_PLAN_IDS.map((id) => PLANS[id].monthlyPriceCents / 100);
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: APP.name,
    url: APP.url,
    description: APP.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    license: "https://opensource.org/licenses/MIT",
    sameAs: [APP.githubUrl],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: String(Math.max(...prices)),
      offerCount: PAID_PLAN_IDS.length + 1,
      url: absoluteUrl("/pricing"),
    },
  };
}

export function buildOrganizationJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: APP.name,
    url: APP.url,
    logo: absoluteUrl("/brand/mark.svg"),
    sameAs: [APP.githubUrl],
    email: APP.supportEmail,
  };
}
