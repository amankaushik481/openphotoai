/** Settings → "Where you're signed in": list sessions and sign out other devices (no IDOR, never yourself). */
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as revokeOneRoute } from "@/app/api/account/sessions/[id]/route";
import { DELETE as revokeOthersRoute, GET as listRoute } from "@/app/api/account/sessions/route";
import { SessionsCard } from "@/components/settings/sessions-card";
import { deviceName, describeUserAgent } from "@/components/settings/user-agent";
import { db } from "@/db";
import { session } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId, newToken } from "@/lib/ids";
import { listSessions, revokeOtherSessions, revokeSession } from "@/server/account/sessions";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", () => sessionMock);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const current = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/server/account/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/account/sessions")>()),
  currentSessionId: vi.fn(async () => current.id),
}));

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

async function addSession(userId: string, over: Partial<typeof session.$inferInsert> = {}) {
  const [row] = await db
    .insert(session)
    .values({ id: newId("ses"), token: newToken(), expiresAt: new Date(Date.now() + 86_400_000), userId, ...over })
    .returning();
  return row!;
}

let me: UserRow;
let other: UserRow;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  me = await createTestUser();
  other = await createTestUser();
  current.id = null;
});

describe("sessions service", () => {
  it("lists only my unexpired sessions, the current one first", async () => {
    const here = await addSession(me.id, { userAgent: CHROME_MAC, updatedAt: new Date(Date.now() - 86_400_000) });
    const phone = await addSession(me.id, { userAgent: SAFARI_IPHONE });
    await addSession(me.id, { expiresAt: new Date(Date.now() - 1000) });
    await addSession(other.id);
    const list = await listSessions(me.id, here.id);
    expect(list.map((s) => [s.id, s.current])).toEqual([
      [here.id, true],
      [phone.id, false],
    ]);
    expect(list[0]).not.toHaveProperty("token");
  });

  it("signs out one other device, never another user's session or this one", async () => {
    const here = await addSession(me.id);
    const phone = await addSession(me.id);
    const theirs = await addSession(other.id);
    await expect(revokeSession(me.id, theirs.id, here.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(revokeSession(me.id, here.id, here.id)).rejects.toMatchObject({ code: "validation_error" });
    await revokeSession(me.id, phone.id, here.id);
    const left = await db.select({ id: session.id }).from(session);
    expect(left.map((r) => r.id).sort()).toEqual([here.id, theirs.id].sort());
  });

  it("signs out every other device, and refuses when the current session is unknown", async () => {
    const here = await addSession(me.id);
    await addSession(me.id);
    await addSession(me.id);
    const theirs = await addSession(other.id);
    await expect(revokeOtherSessions(me.id, null)).rejects.toMatchObject({ code: "unauthorized" });
    expect(await revokeOtherSessions(me.id, here.id)).toBe(2);
    const left = await db.select({ id: session.id }).from(session);
    expect(left.map((r) => r.id).sort()).toEqual([here.id, theirs.id].sort());
  });
});

describe("sessions routes", () => {
  it("need a signed-in user and act on the caller's sessions only", async () => {
    const here = await addSession(me.id);
    const phone = await addSession(me.id);
    const theirs = await addSession(other.id);
    expect((await callRoute(listRoute, {})).status).toBe(401);

    sessionMock.setUser(me);
    current.id = here.id;
    const list = await callRoute(listRoute, {});
    expect(list.json.sessions.map((s: { id: string }) => s.id).sort()).toEqual([here.id, phone.id].sort());
    expect((await callRoute(revokeOneRoute, { method: "DELETE", params: { id: theirs.id } })).status).toBe(404);
    expect((await callRoute(revokeOneRoute, { method: "DELETE", params: { id: phone.id } })).status).toBe(200);
    const res = await callRoute(revokeOthersRoute, { method: "DELETE" });
    expect(res.json).toEqual({ revoked: 0 });
    expect(await db.select().from(session).where(eq(session.id, here.id))).toHaveLength(1);
  });
});

describe("sessions card", () => {
  it("names devices and offers sign-out for other devices only", () => {
    const now = new Date().toISOString();
    const html = renderToStaticMarkup(
      <SessionsCard
        sessions={[
          { id: "ses_1", current: true, userAgent: CHROME_MAC, ipAddress: null, createdAt: now, lastActiveAt: now, expiresAt: now },
          { id: "ses_2", current: false, userAgent: SAFARI_IPHONE, ipAddress: "203.0.113.7", createdAt: now, lastActiveAt: now, expiresAt: now },
        ]}
      />,
    );
    expect(html).toContain("Chrome on macOS");
    expect(html).toContain("This device");
    expect(html).toContain("Safari on iPhone");
    expect(html).toContain("IP 203.0.113.7");
    expect(html).toContain("Sign out Safari on iPhone");
    expect(html).not.toContain("Sign out Chrome on macOS");
    expect(html).toContain("Sign out other devices");
  });

  it("collapses a long list behind 'Show more'", () => {
    const now = new Date().toISOString();
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `ses_${i}`,
      current: i === 0,
      userAgent: CHROME_MAC,
      ipAddress: null,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now,
    }));
    const html = renderToStaticMarkup(<SessionsCard sessions={many} />);
    expect(html.match(/<li /g)).toHaveLength(5);
    expect(html).toContain("Show 3 more sessions");
    expect(html).toContain("7 other devices are signed in.");
  });

  it("parses common user agents", () => {
    expect(describeUserAgent(SAFARI_IPHONE)).toEqual({ browser: "Safari", os: "iPhone", mobile: true });
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe(
      "Edge on Windows",
    );
    expect(deviceName("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0")).toBe("Firefox on Linux");
    expect(deviceName(null)).toBe("Unknown device");
  });
});
