/**
 * GET/HEAD /api/files/[...key]?exp&sig&dl — local storage driver file serving.
 * No session auth: the HMAC signature + expiry in the URL authorize the read (403 otherwise).
 * Supports Range requests (video seeking). Returns 404 when the S3 driver is configured.
 */
import type { NextRequest } from "next/server";
import { serveLocalFile } from "@/server/storage/serve";

interface FileRouteContext {
  params: Promise<{ key: string[] }>;
}

export async function GET(req: NextRequest, ctx: FileRouteContext): Promise<Response> {
  const { key } = await ctx.params;
  return serveLocalFile(req, key.join("/"));
}

export async function HEAD(req: NextRequest, ctx: FileRouteContext): Promise<Response> {
  const { key } = await ctx.params;
  return serveLocalFile(req, key.join("/"), { head: true });
}
