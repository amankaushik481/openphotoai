/** Maintenance: demo accounts older than 24h are deleted (only those), idempotently and in bounded runs. */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { identityModels, user } from "@/db/schema";
import { createLocalStorage } from "@/providers/storage/local";
import { DEMO_CLEANUP_BATCH, deleteExpiredDemoUsers, findExpiredDemoUsers } from "@/server/demo/cleanup";
import { demoEmail } from "@/server/demo/constants";
import { runMaintenance } from "@/server/maintenance";
import { getStorage, setStorageForTesting, storageKeys } from "@/server/storage";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";

const NOW = new Date("2026-11-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let storageDir: string;
beforeAll(async () => {
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-demo-cleanup-"));
  setStorageForTesting(
    createLocalStorage({ dir: storageDir, baseUrl: "http://localhost:3000", secret: "cleanup-secret" }),
  );
});
afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(storageDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await createTestDb();
});

let n = 0;
const demoUser = (createdAt: Date) => createTestUser({ email: demoEmail(`t${n++}`), name: "Demo user", createdAt });

async function existing(ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: user.id }).from(user).where(inArray(user.id, ids));
  return rows.map((r) => r.id).sort();
}

describe("deleteExpiredDemoUsers", () => {
  it("deletes demo accounts older than 24h with their data, and nothing else", async () => {
    const oldDemo = await demoUser(hoursAgo(25));
    const freshDemo = await demoUser(hoursAgo(23));
    const oldRegular = await createTestUser({ email: "someone@example.com", createdAt: hoursAgo(24 * 30) });
    const lookalike = await createTestUser({ email: "demo+x@demo.invalid.example.com", createdAt: hoursAgo(48) });
    await createTestModel(oldDemo.id, {
      status: "ready",
      metadata: { mode: "instant" },
      provider: null,
      providerModelRef: null,
    });
    const key = storageKeys.media(oldDemo.id, "med_demo", "jpg");
    await getStorage().put(key, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });

    expect(await findExpiredDemoUsers(NOW)).toEqual([oldDemo.id]);
    expect(await deleteExpiredDemoUsers(NOW)).toBe(1);

    expect(await existing([oldDemo.id, freshDemo.id, oldRegular.id, lookalike.id])).toEqual(
      [freshDemo.id, oldRegular.id, lookalike.id].sort(),
    );
    expect(await db.select().from(identityModels).where(eq(identityModels.userId, oldDemo.id))).toHaveLength(0);
    expect(await getStorage().exists(key)).toBe(false);

    // Idempotent: nothing left to do.
    expect(await deleteExpiredDemoUsers(NOW)).toBe(0);
  });

  it("is bounded per run and finishes over several runs", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await demoUser(hoursAgo(30 + i))).id);
    expect(await deleteExpiredDemoUsers(NOW, 2)).toBe(2);
    expect(await existing(ids)).toHaveLength(1);
    // Oldest first: the newest of the three is the one left.
    expect(await existing(ids)).toEqual([ids[0]]);
    expect(await deleteExpiredDemoUsers(NOW, 2)).toBe(1);
    expect(await existing(ids)).toEqual([]);
    expect(DEMO_CLEANUP_BATCH).toBeGreaterThan(0);
  });

  it("runs as part of maintenance", async () => {
    const old = await demoUser(hoursAgo(48));
    const fresh = await demoUser(hoursAgo(1));
    const result = await runMaintenance(NOW);
    expect(result.deletedDemoUsers).toBe(1);
    expect(await existing([old.id, fresh.id])).toEqual([fresh.id]);
    expect((await runMaintenance(NOW)).deletedDemoUsers).toBe(0);
  });
});
