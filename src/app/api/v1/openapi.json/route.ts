import { buildOpenApiSpec } from "@/server/openapi/spec";

/** Public OpenAPI 3.1 document, prerendered at build time (it only depends on code + public env). */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return Response.json(buildOpenApiSpec(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
