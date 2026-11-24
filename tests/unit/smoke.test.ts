import { describe, expect, it } from "vitest";
import { createTestDb, createTestUser } from "../helpers/db";

describe("test harness", () => {
  it("creates an in-memory database with migrations applied", async () => {
    await createTestDb();
    const u = await createTestUser({ credits: 5 });
    expect(u.credits).toBe(5);
    expect(u.plan).toBe("free");
  });
});
