/**
 * `getDb()` must hand out ONE client per process, also in production: a Next.js build loads separate
 * copies of `src/db` for route handlers and pages. With per-copy clients, PGlite (`pnpm start` with the
 * default DATABASE_URL) gave each copy its own snapshot of the data directory, so pages never saw rows
 * that API routes wrote (fresh magic links showed "This link has expired" on /verify).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getDb", () => {
  afterEach(async () => {
    const db = await import("@/db");
    await db.closeDb();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("shares one client between separately loaded copies of the module in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "pglite:memory");

    vi.resetModules();
    const routeCopy = await import("@/db");
    routeCopy.setDb(undefined);
    const fromRoutes = routeCopy.getDb();

    vi.resetModules();
    const pageCopy = await import("@/db");
    expect(pageCopy).not.toBe(routeCopy);
    expect(pageCopy.getDb()).toBe(fromRoutes);
  });
});
