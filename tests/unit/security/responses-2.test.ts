/**
 * S2-11 (docs/reviews/security-2.md): authenticated API responses carry `Cache-Control: private, no-store`
 * (GET /api/me, /api/media … had none), so a shared cache in front of a self-hosted deployment can't
 * serve one user's data (emails, balances, signed photo URLs) to another. Public responses and routes
 * that set their own caching are left alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meGet } from "@/app/api/me/route";
import { GET as mediaGet } from "@/app/api/media/route";
import { GET as packsGet } from "@/app/api/packs/route";
import { GET as v1Models } from "@/app/api/v1/models/route";
import { createApiKey } from "@/server/auth/api-keys";
import { route } from "@/server/http";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
});

describe("S2-11: no caching of per-user API responses", () => {
  it("marks session and API-key responses private, no-store", async () => {
    const user = await createTestUser({ plan: "pro", hasPaid: true });
    sessionMock.setUser(user);
    expect((await callRoute(meGet, { url: "/api/me" })).headers.get("cache-control")).toBe("private, no-store");
    expect((await callRoute(mediaGet, { url: "/api/media" })).headers.get("cache-control")).toBe("private, no-store");
    const { row } = await createApiKey(user.id, "k");
    sessionMock.setUser(user, { apiKey: row });
    expect((await callRoute(v1Models, { url: "/api/v1/models" })).headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps a route's own Cache-Control and leaves anonymous public responses alone", async () => {
    const user = await createTestUser();
    sessionMock.setUser(user);
    const own = route({ auth: "user" }, async () => new Response("x", { headers: { "cache-control": "public, max-age=60" } }));
    expect((await callRoute(own, { url: "/api/x" })).headers.get("cache-control")).toBe("public, max-age=60");
    sessionMock.setUser(null);
    expect((await callRoute(packsGet, { url: "/api/packs" })).headers.get("cache-control")).not.toBe("private, no-store");
  });
});
