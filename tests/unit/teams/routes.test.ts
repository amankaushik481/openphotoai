import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listMyKitsRoute } from "@/app/api/brand-kits/route";
import { DELETE as deleteKitRoute, PATCH as patchKitRoute } from "@/app/api/brand-kits/[id]/route";
import { GET as listTeamsRoute, POST as createTeamRoute } from "@/app/api/teams/route";
import { DELETE as deleteTeamRoute, GET as teamRoute, PATCH as renameTeamRoute } from "@/app/api/teams/[id]/route";
import { GET as teamKitsRoute, POST as createKitRoute } from "@/app/api/teams/[id]/brand-kits/route";
import { POST as transferRoute } from "@/app/api/teams/[id]/credits/transfer/route";
import { POST as inviteRoute } from "@/app/api/teams/[id]/invites/route";
import { DELETE as removeMemberRoute, PATCH as memberRoleRoute } from "@/app/api/teams/[id]/members/[memberId]/route";
import { POST as acceptRoute } from "@/app/api/teams/invites/[token]/accept/route";
import { db } from "@/db";
import { brandKits, teamMembers, teams } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { getBalance } from "@/server/credits/ledger";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";
import { BLOCKED_TEXT, inviteTokenFor, resetTeamMocks, studioUser } from "./fixtures";

vi.mock("@/server/auth/session", () => sessionMock);
vi.mock("@/server/email", async () => (await import("./fixtures")).emailModuleMock);
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);

let owner: UserRow;
let member: UserRow;
let stranger: UserRow;
let teamId: string;
let memberRowId: string;
let kitId: string;

/** Owner creates a team via the API, invites + member accepts, owner creates a kit. */
beforeEach(async () => {
  await createTestDb();
  resetTeamMocks();
  sessionMock.reset();
  owner = await studioUser({ credits: 50 });
  member = await createTestUser({ credits: 0 });
  stranger = await studioUser({ credits: 50 });

  sessionMock.setUser(owner);
  const created = await callRoute(createTeamRoute, { body: { name: "Acme" } });
  expect(created.status).toBe(200);
  teamId = created.json.team.id;
  const invited = await callRoute(inviteRoute, { params: { id: teamId }, body: { email: member.email } });
  expect(invited.status).toBe(200);
  memberRowId = invited.json.member.id;
  const kit = await callRoute(createKitRoute, { params: { id: teamId }, body: { name: "Kit", outfitPrompt: "navy suit" } });
  expect(kit.status).toBe(200);
  kitId = kit.json.brandKit.id;

  sessionMock.setUser(member);
  const accepted = await callRoute(acceptRoute, { params: { token: inviteTokenFor(member.email) } });
  expect(accepted.status).toBe(200);
  expect(accepted.json.team).toEqual({ id: teamId, name: "Acme" });
});

describe("auth + happy paths", () => {
  it("requires a session", async () => {
    sessionMock.setUser(null);
    expect((await callRoute(listTeamsRoute)).status).toBe(401);
    expect((await callRoute(listMyKitsRoute)).status).toBe(401);
    expect(sessionMock.resolveRequestAuth).toHaveBeenLastCalledWith(expect.anything(), "user");
  });

  it("gates team creation on the Studio plan", async () => {
    sessionMock.setUser(await createTestUser({ plan: "pro" }));
    const res = await callRoute(createTeamRoute, { body: { name: "Nope" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("plan_limit");
  });

  it("validates bodies", async () => {
    sessionMock.setUser(owner);
    expect((await callRoute(createTeamRoute, { body: { name: "" } })).status).toBe(400);
    const badEmail = await callRoute(inviteRoute, { params: { id: teamId }, body: { email: "not-an-email" } });
    expect(badEmail.json.error.code).toBe("validation_error");
    const badAmount = await callRoute(transferRoute, {
      params: { id: teamId },
      body: { memberUserId: member.id, amount: 2.5 },
    });
    expect(badAmount.status).toBe(400);
    const extra = await callRoute(patchKitRoute, { method: "PATCH", params: { id: kitId }, body: { teamId: "x" } });
    expect(extra.status).toBe(400);
  });

  it("serves team detail, lists and kits to members", async () => {
    sessionMock.setUser(member);
    const detail = await callRoute(teamRoute, { params: { id: teamId } });
    expect(detail.status).toBe(200);
    expect(detail.json.team).toMatchObject({ id: teamId, name: "Acme", role: "member", memberCount: 2 });
    expect(detail.json.brandKits).toHaveLength(1);
    expect((await callRoute(listTeamsRoute)).json.teams).toHaveLength(1);
    expect((await callRoute(teamKitsRoute, { params: { id: teamId } })).json.brandKits[0].id).toBe(kitId);
    expect((await callRoute(listMyKitsRoute)).json.brandKits.map((k: { id: string }) => k.id)).toEqual([kitId]);
  });

  it("blocks unsafe kit prompts with 422", async () => {
    sessionMock.setUser(owner);
    const res = await callRoute(patchKitRoute, {
      method: "PATCH",
      params: { id: kitId },
      body: { backgroundPrompt: BLOCKED_TEXT },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("content_blocked");
  });

  it("transfers credits owner -> member", async () => {
    sessionMock.setUser(owner);
    const res = await callRoute(transferRoute, { params: { id: teamId }, body: { memberUserId: member.id, amount: 20 } });
    expect(res.status).toBe(200);
    expect(res.json.transfer).toMatchObject({ amount: 20, balance: 30 });
    expect(await getBalance(member.id)).toBe(20);

    const broke = await callRoute(transferRoute, { params: { id: teamId }, body: { memberUserId: member.id, amount: 31 } });
    expect(broke.status).toBe(402);
  });

  it("lets a member leave and the owner delete the team", async () => {
    sessionMock.setUser(member);
    const left = await callRoute(removeMemberRoute, { method: "DELETE", params: { id: teamId, memberId: memberRowId } });
    expect(left.json).toEqual({ ok: true, left: true });
    expect((await callRoute(teamRoute, { params: { id: teamId } })).status).toBe(404);

    sessionMock.setUser(owner);
    expect((await callRoute(deleteTeamRoute, { method: "DELETE", params: { id: teamId } })).status).toBe(200);
    expect(await db.select().from(teams)).toHaveLength(0);
    expect(await db.select().from(brandKits)).toHaveLength(0);
  });
});

describe("member permissions", () => {
  beforeEach(() => sessionMock.setUser(member));

  it("can't edit kits, invite, transfer, rename, delete or change roles", async () => {
    const patch = await callRoute(patchKitRoute, { method: "PATCH", params: { id: kitId }, body: { name: "Mine" } });
    expect(patch.status).toBe(403);
    expect((await callRoute(deleteKitRoute, { method: "DELETE", params: { id: kitId } })).status).toBe(403);
    expect((await callRoute(createKitRoute, { params: { id: teamId }, body: { name: "New" } })).status).toBe(403);
    expect((await callRoute(inviteRoute, { params: { id: teamId }, body: { email: "x@example.com" } })).status).toBe(403);
    const transfer = await callRoute(transferRoute, { params: { id: teamId }, body: { memberUserId: owner.id, amount: 1 } });
    expect(transfer.status).toBe(403);
    expect((await callRoute(renameTeamRoute, { method: "PATCH", params: { id: teamId }, body: { name: "X" } })).status).toBe(403);
    expect((await callRoute(deleteTeamRoute, { method: "DELETE", params: { id: teamId } })).status).toBe(403);
    const promote = await callRoute(memberRoleRoute, {
      method: "PATCH",
      params: { id: teamId, memberId: memberRowId },
      body: { role: "admin" },
    });
    expect(promote.status).toBe(403);

    const [kit] = await db.select().from(brandKits).where(eq(brandKits.id, kitId));
    expect(kit!.name).toBe("Kit");
    expect(await getBalance(owner.id)).toBe(50);
  });
});

describe("IDOR attempts by a non-member", () => {
  beforeEach(() => sessionMock.setUser(stranger));

  it("gets 404 for every team-scoped route", async () => {
    const p = { id: teamId };
    const attempts = [
      callRoute(teamRoute, { params: p }),
      callRoute(renameTeamRoute, { method: "PATCH", params: p, body: { name: "Pwned" } }),
      callRoute(deleteTeamRoute, { method: "DELETE", params: p }),
      callRoute(teamKitsRoute, { params: p }),
      callRoute(createKitRoute, { params: p, body: { name: "Injected" } }),
      callRoute(inviteRoute, { params: p, body: { email: "spam@example.com" } }),
      callRoute(transferRoute, { params: p, body: { memberUserId: member.id, amount: 1 } }),
      callRoute(removeMemberRoute, { method: "DELETE", params: { id: teamId, memberId: memberRowId } }),
      callRoute(memberRoleRoute, { method: "PATCH", params: { id: teamId, memberId: memberRowId }, body: { role: "admin" } }),
      callRoute(patchKitRoute, { method: "PATCH", params: { id: kitId }, body: { name: "Pwned" } }),
      callRoute(deleteKitRoute, { method: "DELETE", params: { id: kitId } }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe("not_found");
    }
    expect((await callRoute(listMyKitsRoute)).json.brandKits).toEqual([]);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId))).toHaveLength(2);
    expect(await getBalance(stranger.id)).toBe(50);
  });

  it("can't remove another team's member through their own team id", async () => {
    const own = await callRoute(createTeamRoute, { body: { name: "Mine" } });
    const res = await callRoute(removeMemberRoute, {
      method: "DELETE",
      params: { id: own.json.team.id, memberId: memberRowId },
    });
    expect(res.status).toBe(404);
    const transfer = await callRoute(transferRoute, {
      params: { id: own.json.team.id },
      body: { memberUserId: member.id, amount: 1 },
    });
    expect(transfer.status).toBe(404);
    expect(await getBalance(member.id)).toBe(0);
  });

  it("can't accept someone else's invite or reuse a token", async () => {
    sessionMock.setUser(owner);
    await callRoute(inviteRoute, { params: { id: teamId }, body: { email: "invitee@example.com" } });
    const token = inviteTokenFor("invitee@example.com");

    sessionMock.setUser(stranger);
    const wrong = await callRoute(acceptRoute, { params: { token } });
    expect(wrong.status).toBe(403);

    const invitee = await createTestUser({ email: "INVITEE@example.com" });
    sessionMock.setUser(invitee);
    expect((await callRoute(acceptRoute, { params: { token } })).status).toBe(200);
    expect((await callRoute(acceptRoute, { params: { token } })).status).toBe(404);
  });
});
