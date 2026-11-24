/**
 * Postgres-backed fixed-window rate limiter. CONTRACT FILE (owner: platform-core).
 */
import { RATE_LIMITS, type RateLimitName } from "@/config/rate-limits";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/** Increment and check. Does not throw. */
export async function checkRateLimit(name: RateLimitName, subject: string, cost = 1): Promise<RateLimitResult> {
  void RATE_LIMITS;
  void name;
  void subject;
  void cost;
  throw new Error("not implemented: checkRateLimit (platform-core)");
}

/** Increment and throw AppError("rate_limited") when over the limit. */
export async function rateLimit(name: RateLimitName, subject: string, cost = 1): Promise<void> {
  void name;
  void subject;
  void cost;
  throw new Error("not implemented: rateLimit (platform-core)");
}
