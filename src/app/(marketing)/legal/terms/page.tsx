import type { Metadata } from "next";

import { JsonLd } from "@/components/marketing/json-ld";
import { LegalDocumentView } from "@/components/marketing/legal-document";
import { toPlainText } from "@/content/inline";
import { getLegalDocument, LEGAL_LAST_UPDATED } from "@/content/legal";
import { buildBreadcrumbJsonLd } from "@/content/structured-data";

const doc = getLegalDocument("terms");

export const metadata: Metadata = {
  title: doc.title,
  description: toPlainText(doc.summary),
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: doc.title, path: "/legal/terms" },
        ])}
      />
      <LegalDocumentView doc={doc} lastUpdated={LEGAL_LAST_UPDATED} />
    </>
  );
}
