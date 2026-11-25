/**
 * One-click demo (DEMO_MODE only; 404 otherwise).
 *
 *   GET  → `{ enabled: true }`: lets the static landing page decide whether to show its demo button.
 *   POST → creates a fresh demo account (credits, ready Instant model, first pack batch), signs the
 *          browser in (Set-Cookie) and answers `{ redirect }` (the batch page, so the gallery fills
 *          in live; `/app` when the batch couldn't start).
 *
 * POST is public, refused cross-site (no login CSRF into a demo account) and rate-limited per IP and
 * for the whole deployment, since every call creates an account with stored images.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createDemoAccount } from "@/server/demo/seed";
import { createDemoSessionCookies } from "@/server/demo/session";
import { errorResponse, errors, isSameOriginRequest, knownClientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** DEMO_MODE is a runtime setting (e.g. Docker env): never bake the probe answer in at build time. */
export const dynamic = "force-dynamic";

/** The probe answer only changes with a redeploy; let browsers/CDNs keep it briefly. */
const PROBE_CACHE = "public, max-age=300";

export async function GET(): Promise<Response> {
  if (!env.DEMO_MODE) {
    const res = errorResponse(errors.notFound());
    res.headers.set("Cache-Control", PROBE_CACHE);
    return res;
  }
  return NextResponse.json({ enabled: true }, { headers: { "Cache-Control": PROBE_CACHE } });
}

export const POST = route({ auth: "public" }, async ({ req }) => {
  if (!env.DEMO_MODE) throw errors.notFound();
  if (!isSameOriginRequest(req)) throw errors.forbidden("Cross-site request refused.");
  // Without a known client IP the per-IP bucket would be one bucket for every visitor (5 demos an
  // hour for the whole deployment); the deployment-wide limit still bounds it.
  const ip = knownClientIp(req);
  if (ip) await rateLimit("demoLoginsPerHourPerIp", `ip:${ip}`);
  await rateLimit("demoLoginsPerHour", "global");

  const account = await createDemoAccount({
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  });
  const cookies = await createDemoSessionCookies(account.user.id, req.headers);

  const redirect = account.batchId ? `/app/batches/${account.batchId}` : "/app";
  const res = NextResponse.json({ redirect }, { headers: { "Cache-Control": "no-store" } });
  for (const cookie of cookies) res.headers.append("Set-Cookie", cookie);
  return res;
});
