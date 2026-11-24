import { serializeJsonLd, type JsonLdObject } from "@/content/structured-data";

/** Structured data for search engines. Content is escaped by serializeJsonLd (no tag break-out). */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
