/**
 * No admin page or admin API may answer a non-admin. Enumerates the files on disk, so a page or route
 * added later without `requireAdminPage()` / `route({ auth: "admin" })` fails here.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/db/types";
import { callRoute, createTestDb, createTestJob, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/email", () => ({ sendEmailSafe: vi.fn(async () => null), sendEmail: vi.fn(async () => null) }));

const ROOT = path.resolve(process.cwd(), "src/app");

function findFiles(dir: string, name: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return findFiles(full, name);
    return entry === name ? [full] : [];
  });
}

const pages = [...findFiles(path.join(ROOT, "admin"), "page.tsx"), path.join(ROOT, "admin", "layout.tsx")];
const routes = findFiles(path.join(ROOT, "api", "admin"), "route.ts");
const rel = (file: string) => path.relative(ROOT, file);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

let member: UserRow;
let jobId: string;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  member = await createTestUser({ email: "member@example.com", credits: 10 });
  jobId = (await createTestJob(member.id, { status: "failed", creditsCharged: 4 })).id;
});

it("finds the admin surface", () => {
  expect(pages.length).toBeGreaterThanOrEqual(7);
  expect(routes.length).toBeGreaterThanOrEqual(10);
});

describe.each([
  ["signed out", () => null],
  ["a member", () => member],
  ["a suspended admin", () => ({ ...member, role: "admin" as const, banned: true })],
])("admin pages: %s", (_who, who) => {
  it.each(pages.map((file) => [rel(file), file]))("%s answers 404", async (_name, file) => {
    // The member's own ids: a page can't pass by 404ing on an unknown id itself.
    const params = Promise.resolve({ id: file.includes("jobs") ? jobId : member.id });
    const searchParams = Promise.resolve({});
    sessionMock.setUser(who());
    // Signed out, the real requireAdminPage 404s too; the mock mirrors it for every non-admin.
    sessionMock.requireAdminPage.mockImplementation(async () => {
      const { notFound } = await import("next/navigation");
      const u = who();
      if (!u || u.banned || u.role !== "admin") return notFound();
      return u;
    });
    const mod = (await import(file)) as { default: (props: Record<string, unknown>) => Promise<unknown> };
    await expect(mod.default({ params, searchParams, children: null })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    expect(sessionMock.requireAdminPage).toHaveBeenCalled();
  });
});

describe("admin API routes", () => {
  const handlers = routes.flatMap((file) => METHODS.map((method) => [`${method} ${rel(file)}`, file, method] as const));

  it.each(handlers)("%s refuses non-admins", async (_name, file, method) => {
    const mod = (await import(file)) as Record<string, unknown>;
    const handler = mod[method] as ((req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) | undefined;
    if (!handler) return;
    const params = { id: jobId };
    const body = method === "GET" || method === "DELETE" ? undefined : {};

    sessionMock.setUser(null);
    expect((await callRoute(handler, { method, params, body })).status).toBe(401);

    sessionMock.setUser(member);
    const res = await callRoute(handler, { method, params, body });
    expect(res.status).toBe(403);
    expect(sessionMock.resolveRequestAuth).toHaveBeenLastCalledWith(expect.anything(), "admin");
  });
});
