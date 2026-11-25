import type { Metadata } from "next";

import { ApiDocs } from "@/components/api-docs/api-docs";
import { APP } from "@/config/app";
import { marketingMetadata } from "@/content/site";
import { buildOpenApiSpec } from "@/server/openapi/spec";

/** Fully static: the reference is generated from the OpenAPI document at build time. */
export const dynamic = "force-static";

export const metadata: Metadata = marketingMetadata({
  title: "API reference",
  description: `${APP.name} REST API: authentication, rate limits, idempotency, errors, job polling and every endpoint, with curl, JavaScript and Python examples.`,
  path: "/docs/api",
});

export default function ApiDocsPage() {
  return <ApiDocs spec={buildOpenApiSpec()} />;
}
