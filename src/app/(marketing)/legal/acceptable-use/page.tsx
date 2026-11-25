import type { Metadata } from "next";

import { JsonLd } from "@/components/marketing/json-ld";
import { LegalDocumentView } from "@/components/marketing/legal-document";
import { toPlainText } from "@/content/inline";
import { getLegalDocument, LEGAL_LAST_UPDATED } from "@/content/legal";
import { marketingMetadata } from "@/content/site";
import { buildBreadcrumbJsonLd } from "@/content/structured-data";

const doc = getLegalDocument("acceptable-use");

export const metadata: Metadata = marketingMetadata({
  title: doc.title,
  description: toPlainText(doc.summary),
  path: "/legal/acceptable-use",
});

export default function AcceptableUsePage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: doc.title, path: "/legal/acceptable-use" },
        ])}
      />
      <LegalDocumentView doc={doc} lastUpdated={LEGAL_LAST_UPDATED} />
    </>
  );
}
