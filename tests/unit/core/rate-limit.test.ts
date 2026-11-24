import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS } from "@/config/rate-limits";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { AppError } from "@/server/http";
import { checkRateLimit, pruneRateLimits, rateLimit } from "@/server/rate-limit";
import { createTestDb } from "../../helpers/db";

const { limit: TRAININGS_LIMIT, windowSec: DAY } = RATE_LIMITS.trainingsPerDay;
const START = new Date("2026-03-10T12:00:30.000Z");

beforeEach(async () => {
  await createTestDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("counts hits and reports remaining until the limit is reached", async () => {
    for (let i = 1; i <= TRAININGS_LIMIT; i++) {
      const r = await checkRateLimit("trainingsPerDay", "user:a");
      expect(r).toMatchObject({ ok: true, limit: TRAININGS_LIMIT, remaining: TRAININGS_LIMIT - i });
    }
    const over = await checkRateLimit("trainingsPerDay", "user:a");
    expect(over.ok).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.resetAt.toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });

  it("supports a custom cost and a zero-cost peek", async () => {
    expect((await checkRateLimit("jobsPerMinute", "user:a", 15)).remaining).toBe(5);
    expect((await checkRateLimit("jobsPerMinute", "user:a", 0)).remaining).toBe(5);
    expect((await checkRateLimit("jobsPerMinute", "user:a", 6)).ok).toBe(false);
    await expect(checkRateLimit("jobsPerMinute", "user:a", -1)).rejects.toThrow(RangeError);
  });

  it("starts a fresh window after the previous one ends", async () => {
    for (let i = 0; i < RATE_LIMITS.jobsPerMinute.limit; i++) await checkRateLimit("jobsPerMinute", "user:a");
    expect((await checkRateLimit("jobsPerMinute", "user:a")).ok).toBe(false);

    vi.setSystemTime(new Date(START.getTime() + 30_000)); // 12:01:00 — next minute window
    const fresh = await checkRateLimit("jobsPerMinute", "user:a");
    expect(fresh).toMatchObject({ ok: true, remaining: RATE_LIMITS.jobsPerMinute.limit - 1 });
    expect(fresh.resetAt.toISOString()).toBe("2026-03-10T12:02:00.000Z");
  });

  it("keeps independent counters per subject and per limit name", async () => {
    await checkRateLimit("trainingsPerDay", "user:a", TRAININGS_LIMIT);
    expect((await checkRateLimit("trainingsPerDay", "user:a")).ok).toBe(false);
    expect((await checkRateLimit("trainingsPerDay", "user:b")).ok).toBe(true);
    expect((await checkRateLimit("uploadsPerMinute", "user:a")).ok).toBe(true);
  });

  it("never lets parallel hits exceed the limit", async () => {
    const results = await Promise.all(
      Array.from({ length: TRAININGS_LIMIT + 5 }, () => checkRateLimit("trainingsPerDay", "user:race")),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(TRAININGS_LIMIT);
  });
});

describe("rateLimit", () => {
  it("throws rate_limited with Retry-After seconds once over the limit", async () => {
    for (let i = 0; i < TRAININGS_LIMIT; i++) await rateLimit("trainingsPerDay", "user:a");
    const err = await rateLimit("trainingsPerDay", "user:a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "rate_limited", status: 429 });
    // 12:00:30 -> midnight UTC = 11h59m30s
    expect((err as AppError).details).toEqual({ retryAfterSec: 11 * 3600 + 59 * 60 + 30 });
  });
});

describe("pruneRateLimits", () => {
  it("deletes only windows older than the cutoff (default: longest window)", async () => {
    await checkRateLimit("jobsPerMinute", "user:old");
    await checkRateLimit("trainingsPerDay", "user:old");
    vi.setSystemTime(new Date(START.getTime() + 2 * DAY * 1000));
    await checkRateLimit("jobsPerMinute", "user:new");

    expect(await pruneRateLimits()).toBe(2);
    const left = await db.select({ key: rateLimits.key }).from(rateLimits);
    expect(left).toEqual([{ key: "jobsPerMinute:user:new" }]);

    expect(await pruneRateLimits(new Date(Date.now() + 60_000))).toBe(1);
  });
});
