/**
 * Invoke a Next.js route handler (e.g. one built with `route()`) without a server:
 *
 *   const res = await callRoute(GET, { url: "/api/credits?limit=10" });
 *   expect(res.status).toBe(200);
 *   expect(res.json.balance).toBe(5);
 *
 * Plain-object bodies are sent as JSON; FormData/strings/blobs are sent as-is.
 */
import { NextRequest } from "next/server";

type RouteHandler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

export interface CallRouteOptions<P> {
  /** Defaults to POST when a body is given, GET otherwise. */
  method?: string;
  /** Path (resolved against http://localhost:3000) or absolute URL. */
  url?: string;
  body?: unknown;
  /** Dynamic route params, e.g. `{ id: "job_123" }`. */
  params?: P;
  headers?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read arbitrary JSON bodies
export interface CallRouteResult<T = any> {
  status: number;
  /** Parsed JSON body, or null for non-JSON responses (read them from `response`). */
  json: T;
  headers: Headers;
  /** The untouched Response (body not consumed). */
  response: Response;
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see CallRouteResult
export async function callRoute<T = any, P = Record<string, string>>(
  handler: RouteHandler<P>,
  opts: CallRouteOptions<P> = {},
): Promise<CallRouteResult<T>> {
  const headers = new Headers(opts.headers);
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (isRawBody(opts.body)) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  const req = new NextRequest(new URL(opts.url ?? "/", "http://localhost:3000"), {
    method: opts.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
  });
  const response = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  const json = (isJson ? await response.clone().json() : null) as T;
  return { status: response.status, json, headers: response.headers, response };
}
