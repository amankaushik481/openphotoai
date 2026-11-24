import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * `Authorization: Bearer <CRON_SECRET>` check (the header Vercel Cron sends).
 * Always false when CRON_SECRET is not configured. Constant-time comparison.
 */
export function isCronAuthorized(req: Request, secret: string | undefined = env.CRON_SECRET): boolean {
  if (!secret) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization")?.trim() ?? "");
  if (!match) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(match[1]!), digest(secret));
}
