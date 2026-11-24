import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getEnv, resetEnvCache } from "@/lib/env";
import { inspectEnv } from "../../../scripts/lib/check-env";
import { describeDatabase, parseDatabaseUrl, redactDatabaseUrl } from "../../../scripts/lib/database";
import { runMigrations } from "../../../scripts/lib/migrate";
import { seedAdminUser, validatePacks } from "../../../scripts/lib/seed";
import { createTestDb, createTestUser } from "../../helpers/db";

const listPacks = vi.hoisted(() => vi.fn());
vi.mock("@/server/packs/registry", () => ({ listPacks }));

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

describe("runMigrations", () => {
  it("applies every migration to pglite:memory", async () => {
    const result = await runMigrations({ databaseUrl: "pglite:memory" });
    expect(result.total).toBeGreaterThan(0);
    expect(result).toEqual({ database: "PGlite (in memory)", applied: result.total, total: result.total });
  });

  it("creates missing parent directories and is idempotent on a persistent PGlite", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "openshoot-migrate-"));
    tmpDirs.push(root);
    const url = `pglite:${path.join(root, "nested", "pglite")}`;
    const first = await runMigrations({ databaseUrl: url });
    expect(first.applied).toBe(first.total);
    const second = await runMigrations({ databaseUrl: url });
    expect(second.applied).toBe(0);
  });
});

describe("database url helpers", () => {
  it("parses and redacts", () => {
    expect(parseDatabaseUrl("pglite:memory")).toEqual({ kind: "pglite", memory: true });
    expect(parseDatabaseUrl("pglite:./.data/x", "/srv/app")).toEqual({ kind: "pglite", memory: false, dataDir: "/srv/app/.data/x" });
    expect(() => parseDatabaseUrl("mysql://x")).toThrow(/Unsupported DATABASE_URL/);
    expect(redactDatabaseUrl("postgres://u:secret@db:5432/app")).toBe("postgres://u:***@db:5432/app");
    expect(describeDatabase(parseDatabaseUrl("postgres://u:secret@db:5432/app"))).toBe("Postgres db:5432/app");
  });
});

describe("inspectEnv", () => {
  function envWith(vars: Record<string, string>) {
    vi.stubEnv("NODE_ENV", "development");
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    resetEnvCache();
    try {
      return getEnv();
    } finally {
      vi.unstubAllEnvs();
      resetEnvCache();
    }
  }

  it("lists active providers for a mock dev setup", () => {
    const report = inspectEnv(envWith({ MOCK_PROVIDERS: "true", DATABASE_URL: "pglite:./.data/pglite", BETTER_AUTH_SECRET: "" }));
    const byArea = Object.fromEntries(report.rows.map((r) => [r.area, r.value]));
    expect(byArea).toMatchObject({
      Database: "pglite",
      "AI provider": "mock",
      Payments: "mock",
      Email: "mock",
      Storage: "local",
      "Face detection": "mock",
      Moderation: "mock",
      Webhooks: "disabled",
    });
    expect(report.warnings.some((w) => w.includes("BETTER_AUTH_SECRET"))).toBe(true);
  });

  it("warns about PGlite and mocks in production", () => {
    const report = inspectEnv(
      envWith({
        NODE_ENV: "production",
        MOCK_PROVIDERS: "true",
        DATABASE_URL: "pglite:./.data/pglite",
        BETTER_AUTH_SECRET: "a-real-secret-a-real-secret-a-real-secret",
        NEXT_PUBLIC_APP_URL: "https://shoot.example.com",
        CRON_SECRET: "cron",
      }),
    );
    expect(report.mode).toBe("production");
    expect(report.warnings.join("\n")).toMatch(/PGlite in production/);
    expect(report.warnings.join("\n")).toMatch(/Mock AI provider/);
    expect(report.rows.find((r) => r.area === "Webhooks")?.value).toBe("enabled");
  });
});

describe("seed", () => {
  beforeEach(async () => {
    await createTestDb();
    listPacks.mockReset();
  });

  it("creates the admin user once and promotes on re-run", async () => {
    const first = await seedAdminUser("  Admin@Example.com ");
    expect(first).toMatchObject({ email: "admin@example.com", created: true });
    await db.update(user).set({ role: "user", emailVerified: false }).where(eq(user.id, first.id));
    const second = await seedAdminUser("admin@example.com");
    expect(second).toEqual({ ...first, created: false });
    const rows = await db.select().from(user).where(eq(user.email, "admin@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "admin", emailVerified: true, name: "Admin" });
    expect(rows[0]!.id).toMatch(/^usr_/);
  });

  it("promotes an existing account without changing its name", async () => {
    const existing = await createTestUser({ email: "boss@example.com", name: "Boss" });
    expect(await seedAdminUser("boss@example.com")).toEqual({ id: existing.id, email: "boss@example.com", created: false });
    const [row] = await db.select().from(user).where(eq(user.id, existing.id));
    expect(row).toMatchObject({ role: "admin", name: "Boss" });
  });

  it("rejects invalid emails", async () => {
    await expect(seedAdminUser("not-an-email")).rejects.toThrow();
  });

  it("validates packs, skipping while the registry is a stub", async () => {
    listPacks.mockResolvedValueOnce([{ prompts: [{}, {}] }, { prompts: [{}] }]);
    expect(await validatePacks()).toEqual({ status: "ok", packs: 2, prompts: 3 });
    listPacks.mockRejectedValueOnce(new Error("not implemented: listPacks (packs)"));
    expect(await validatePacks()).toMatchObject({ status: "skipped" });
    listPacks.mockRejectedValueOnce(new Error("packs/bad.json: prompts too short"));
    await expect(validatePacks()).rejects.toThrow("prompts too short");
  });
});
