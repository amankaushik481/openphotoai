import { ACCEPTABLE_USE_TEMPLATE } from "./acceptable-use";
import { PRIVACY_TEMPLATE } from "./privacy";
import { TERMS_TEMPLATE } from "./terms";
import type { LegalDocument, LegalSlug } from "./types";
import { getLegalVariables, renderLegalDocument, type LegalVariables } from "./variables";

export type { LegalBlock, LegalDocument, LegalSection, LegalSlug } from "./types";
export {
  LEGAL_LAST_UPDATED,
  documentStrings,
  findPlaceholders,
  getLegalVariables,
  interpolateTemplate,
  renderLegalDocument,
  type LegalVariables,
} from "./variables";

export const LEGAL_TEMPLATES: Record<LegalSlug, LegalDocument> = {
  terms: TERMS_TEMPLATE,
  privacy: PRIVACY_TEMPLATE,
  "acceptable-use": ACCEPTABLE_USE_TEMPLATE,
};

export const LEGAL_PAGES: { slug: LegalSlug; href: string; title: string }[] = [
  { slug: "terms", href: "/legal/terms", title: TERMS_TEMPLATE.title },
  { slug: "privacy", href: "/legal/privacy", title: PRIVACY_TEMPLATE.title },
  { slug: "acceptable-use", href: "/legal/acceptable-use", title: ACCEPTABLE_USE_TEMPLATE.title },
];

/** The interpolated legal document for a page. */
export function getLegalDocument(slug: LegalSlug, vars: LegalVariables = getLegalVariables()): LegalDocument {
  return renderLegalDocument(LEGAL_TEMPLATES[slug], vars);
}
