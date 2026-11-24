import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { rateLimits, teamMembers, teams, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { RATE_LIMITS } from "@/config/rate-limits";
import { AppError } from "@/server/http";
import {
  acceptInvite,
  createTeam,
  deleteTeam,
  getInvitePreview,
  getTeamDetail,
  getTeamForMember,
  inviteMember,
  listMyTeams,
  removeMember,
  renameTeam,
  updateMemberRole,
} from "@/server/teams";
import { createTestDb, createTestUser } from "../../helpers/db";
import { inviteTokenFor, resetTeamMocks, sentEmails, studioUser } from "./fixtures";

vi.mock("@/server/email", async () => (await import("./fixtures")).emailModuleMock);
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

/** Owner invites `member` and `member` accepts. Returns the member's membership id. */
async function join(owner: UserRow, teamId: string, member: UserRow): Promise<string> {
  const { member: row } = await inviteMember(owner, teamId, member.email);
  await acceptInvite(member, inviteTokenFor(member.email));
  return row.id;
}

let owner: UserRow;
beforeEach(async () => {
  await createTestDb();
  resetTeamMocks();
  owner = await studioUser();
});

describe("createTeam", () => {
  it.each(["free", "starter", "pro"] as const)("is refused on the %s plan", async (plan) => {
    const u = await createTestUser({ plan });
    const err = await rejection(createTeam(u, "Acme"));
    expect(err.code).toBe("plan_limit");
    expect(await db.select().from(teams)).toHaveLength(0);
  });

  it("creates the team with the owner as its first active member", async () => {
    const team = await createTeam(owner, "  Acme Inc  ");
    expect(team).toMatchObject({ name: "Acme Inc", ownerId: owner.id });
    const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
    expect(members).toEqual([
      expect.objectContaining({ userId: owner.id, role: "owner", status: "active", email: owner.email.toLowerCase() }),
    ]);
    expect((await getTeamForMember(owner.id, team.id)).team.id).toBe(team.id);
  });

  it("allows only one owned team per user, even under concurrency", async () => {
    const results = await Promise.allSettled([createTeam(owner, "A"), createTeam(owner, "B")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const err = await rejection(createTeam(owner, "C"));
    expect(err.code).toBe("conflict");
    expect(await db.select().from(teams).where(eq(teams.ownerId, owner.id))).toHaveLength(1);
  });

  it("rejects a blank name", async () => {
    expect((await rejection(createTeam(owner, "   "))).code).toBe("validation_error");
  });
});

describe("team access", () => {
  it("lists only teams the user actively belongs to, with roles and member counts", async () => {
    const team = await createTeam(owner, "Acme");
    const member = await createTestUser({ name: "Mia" });
    const invited = await createTestUser();
    const stranger = await createTestUser();
    await join(owner, team.id, member);
    await inviteMember(owner, team.id, invited.email);

    expect(await listMyTeams(owner.id)).toEqual([
      expect.objectContaining({ id: team.id, role: "owner", memberCount: 2, ownerName: "Olivia Owner" }),
    ]);
    expect(await listMyTeams(member.id)).toEqual([expect.objectContaining({ id: team.id, role: "member" })]);
    expect(await listMyTeams(invited.id)).toEqual([]);
    expect(await listMyTeams(stranger.id)).toEqual([]);
  });

  it("hides the team from strangers and pending invitees (not_found)", async () => {
    const team = await createTeam(owner, "Acme");
    const invited = await createTestUser();
    await inviteMember(owner, team.id, invited.email);
    const stranger = await createTestUser();
    expect((await rejection(getTeamForMember(stranger.id, team.id))).code).toBe("not_found");
    expect((await rejection(getTeamForMember(invited.id, team.id))).code).toBe("not_found");
    expect((await rejection(getTeamDetail(stranger.id, team.id))).code).toBe("not_found");
  });

  it("shows pending invites to managers only", async () => {
    const team = await createTeam(owner, "Acme");
    const member = await createTestUser();
    await join(owner, team.id, member);
    await inviteMember(owner, team.id, "pending@example.com");

    const asOwner = await getTeamDetail(owner.id, team.id);
    expect(asOwner.members.map((m) => m.status)).toEqual(["active", "active", "invited"]);
    expect(asOwner.team).toMatchObject({ seats: 25, seatsUsed: 3, memberCount: 2 });
    expect(asOwner.me).toMatchObject({ role: "owner", isOwner: true, canManage: true });

    const asMember = await getTeamDetail(member.id, team.id);
    expect(asMember.members.map((m) => m.email)).not.toContain("pending@example.com");
    expect(asMember.me).toMatchObject({ role: "member", isOwner: false, canManage: false });
  });

  it("lets only the owner rename or delete the team", async () => {
    const team = await createTeam(owner, "Acme");
    const member = await createTestUser();
    const memberId = await join(owner, team.id, member);
    await updateMemberRole(owner.id, team.id, memberId, "admin");

    expect((await rejection(renameTeam(member.id, team.id, "Hijacked"))).code).toBe("forbidden");
    expect((await rejection(deleteTeam(member.id, team.id))).code).toBe("forbidden");
    expect((await renameTeam(owner.id, team.id, "Acme 2")).name).toBe("Acme 2");

    await deleteTeam(owner.id, team.id);
    expect(await db.select().from(teams)).toHaveLength(0);
    expect(await db.select().from(teamMembers)).toHaveLength(0);
  });
});

describe("invites", () => {
  it("are rate limited per inviter (invitesPerHour, shared with multi-person invites)", async () => {
    const team = await createTeam(owner, "Acme");
    const { limit } = RATE_LIMITS.invitesPerHour;
    // Re-sends count too: every email is an invite email.
    for (let i = 0; i < limit; i++) await inviteMember(owner, team.id, "again@example.com");
    const err = await rejection(inviteMember(owner, team.id, "again@example.com"));
    expect(err.code).toBe("rate_limited");
    expect(sentEmails).toHaveLength(limit);
    // Someone who can't invite at all gets the permission error, not a spent counter.
    const outsider = await createTestUser();
    expect((await rejection(inviteMember(outsider, team.id, "x@example.com"))).code).not.toBe("rate_limited");
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, `invitesPerHour:user:${outsider.id}`));
    expect(row).toBeUndefined();
  });

  it("emails a join link and stores only the token's hash", async () => {
    const team = await createTeam(owner, "Acme");
    const { member, resent } = await inviteMember(owner, team.id, "  New.Hire@Example.COM ");
    expect(resent).toBe(false);
    expect(member).toMatchObject({ email: "new.hire@example.com", status: "invited", role: "member", userId: null });

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      template: "team_invite",
      to: "new.hire@example.com",
      props: { inviterName: "Olivia Owner", teamName: "Acme" },
    });
    const token = inviteTokenFor("new.hire@example.com");
    expect((sentEmails[0]!.props as { url: string }).url).toBe(`http://localhost:3000/teams/join/${token}`);
    expect(member.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(member.inviteTokenHash).not.toContain(token);

    expect(await getInvitePreview(token)).toEqual({
      teamId: team.id,
      teamName: "Acme",
      inviterName: "Olivia Owner",
      email: "new.hire@example.com",
    });
    expect(await getInvitePreview("not-a-token")).toBeNull();
  });

  it("is idempotent per email: re-inviting rotates the link without taking a seat", async () => {
    const team = await createTeam(owner, "Acme");
    const first = await inviteMember(owner, team.id, "a@example.com");
    const oldToken = inviteTokenFor("a@example.com");
    const second = await inviteMember(owner, team.id, "A@example.com");
    expect(second.resent).toBe(true);
    expect(second.member.id).toBe(first.member.id);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id))).toHaveLength(2);
    expect(await getInvitePreview(oldToken)).toBeNull();
    expect(await getInvitePreview(inviteTokenFor("a@example.com"))).not.toBeNull();
  });

  it("refuses to invite someone who is already a member", async () => {
    const team = await createTeam(owner, "Acme");
    const err = await rejection(inviteMember(owner, team.id, owner.email.toUpperCase()));
    expect(err.code).toBe("conflict");
  });

  it("enforces the seat limit, counting the owner, active members and pending invites", async () => {
    const team = await createTeam(owner, "Acme");
    // Studio has 25 seats: owner + 24 invites fill it.
    for (let i = 0; i < 24; i++) await inviteMember(owner, team.id, `p${i}@example.com`);
    const err = await rejection(inviteMember(owner, team.id, "one-too-many@example.com"));
    expect(err.code).toBe("plan_limit");
    // Re-sending an existing invite still works at the limit.
    expect((await inviteMember(owner, team.id, "p3@example.com")).resent).toBe(true);
    // Revoking an invite frees a seat.
    const [pending] = await db.select().from(teamMembers).where(eq(teamMembers.email, "p0@example.com"));
    await removeMember(owner.id, team.id, pending!.id);
    await expect(inviteMember(owner, team.id, "one-too-many@example.com")).resolves.toBeDefined();
  });

  it("stops invites when the owner's plan no longer includes teams", async () => {
    const team = await createTeam(owner, "Acme");
    await db.update(userTable).set({ plan: "pro" }).where(eq(userTable.id, owner.id));
    const err = await rejection(inviteMember(owner, team.id, "a@example.com"));
    expect(err.code).toBe("plan_limit");
  });

  it("only lets owners and admins invite", async () => {
    const team = await createTeam(owner, "Acme");
    const member = await createTestUser();
    const memberId = await join(owner, team.id, member);
    expect((await rejection(inviteMember(member, team.id, "x@example.com"))).code).toBe("forbidden");

    await updateMemberRole(owner.id, team.id, memberId, "admin");
    await expect(inviteMember(member, team.id, "x@example.com")).resolves.toMatchObject({ resent: false });
    expect(sentEmails.at(-1)?.props).toMatchObject({ inviterName: member.name });
  });

  it("accepts with a matching email (case-insensitive) and makes the token single-use", async () => {
    const team = await createTeam(owner, "Acme");
    const invitee = await createTestUser({ email: "Jamie@Example.com" });
    await inviteMember(owner, team.id, "jamie@example.com");
    const token = inviteTokenFor("jamie@example.com");

    const { team: joined } = await acceptInvite(invitee, token);
    expect(joined.id).toBe(team.id);
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.email, "jamie@example.com"));
    expect(row).toMatchObject({ status: "active", userId: invitee.id, inviteTokenHash: null });
    expect((await getTeamForMember(invitee.id, team.id)).member.id).toBe(row!.id);

    expect((await rejection(acceptInvite(invitee, token))).code).toBe("not_found");
    expect(await getInvitePreview(token)).toBeNull();
  });

  it("rejects an invite accepted by a different account", async () => {
    const team = await createTeam(owner, "Acme");
    await inviteMember(owner, team.id, "intended@example.com");
    const token = inviteTokenFor("intended@example.com");
    const other = await createTestUser({ email: "someone-else@example.com" });

    const err = await rejection(acceptInvite(other, token));
    expect(err.code).toBe("forbidden");
    const [row] = await db.select().from(teamMembers).where(eq(teamMembers.email, "intended@example.com"));
    expect(row).toMatchObject({ status: "invited", userId: null });
    expect((await rejection(getTeamForMember(other.id, team.id))).code).toBe("not_found");
  });

  it("rejects unknown or empty tokens", async () => {
    const u = await createTestUser();
    expect((await rejection(acceptInvite(u, "nope"))).code).toBe("not_found");
    expect((await rejection(acceptInvite(u, ""))).code).toBe("not_found");
  });
});

describe("removing members", () => {
  it("lets members leave but not remove others", async () => {
    const team = await createTeam(owner, "Acme");
    const a = await createTestUser();
    const b = await createTestUser();
    const aId = await join(owner, team.id, a);
    const bId = await join(owner, team.id, b);

    expect((await rejection(removeMember(a.id, team.id, bId))).code).toBe("forbidden");
    expect(await removeMember(a.id, team.id, aId)).toEqual({ left: true });
    expect((await rejection(getTeamForMember(a.id, team.id))).code).toBe("not_found");
  });

  it("never removes the owner", async () => {
    const team = await createTeam(owner, "Acme");
    const admin = await createTestUser();
    const adminId = await join(owner, team.id, admin);
    await updateMemberRole(owner.id, team.id, adminId, "admin");
    const ownerRow = (await getTeamForMember(owner.id, team.id)).member;

    expect((await rejection(removeMember(admin.id, team.id, ownerRow.id))).code).toBe("forbidden");
    expect((await rejection(removeMember(owner.id, team.id, ownerRow.id))).code).toBe("forbidden");
  });

  it("lets admins remove members but only the owner remove admins", async () => {
    const team = await createTeam(owner, "Acme");
    const [admin1, admin2, member] = [await createTestUser(), await createTestUser(), await createTestUser()];
    const admin1Id = await join(owner, team.id, admin1);
    const admin2Id = await join(owner, team.id, admin2);
    const memberId = await join(owner, team.id, member);
    await updateMemberRole(owner.id, team.id, admin1Id, "admin");
    await updateMemberRole(owner.id, team.id, admin2Id, "admin");

    expect((await rejection(removeMember(admin1.id, team.id, admin2Id))).code).toBe("forbidden");
    expect(await removeMember(admin1.id, team.id, memberId)).toEqual({ left: false });
    expect(await removeMember(owner.id, team.id, admin2Id)).toEqual({ left: false });
  });

  it("can't touch memberships of another team (IDOR)", async () => {
    const team = await createTeam(owner, "Acme");
    const otherOwner = await studioUser();
    const otherTeam = await createTeam(otherOwner, "Other");
    const victim = await createTestUser();
    const victimId = await join(otherOwner, otherTeam.id, victim);

    // Own team id + foreign member id -> not found; foreign team id -> not found.
    expect((await rejection(removeMember(owner.id, team.id, victimId))).code).toBe("not_found");
    expect((await rejection(removeMember(owner.id, otherTeam.id, victimId))).code).toBe("not_found");
    expect((await rejection(updateMemberRole(owner.id, team.id, victimId, "admin"))).code).toBe("not_found");
    expect((await getTeamForMember(victim.id, otherTeam.id)).member.role).toBe("member");
  });

  it("only the owner changes roles", async () => {
    const team = await createTeam(owner, "Acme");
    const admin = await createTestUser();
    const member = await createTestUser();
    const adminId = await join(owner, team.id, admin);
    const memberId = await join(owner, team.id, member);
    await updateMemberRole(owner.id, team.id, adminId, "admin");

    expect((await rejection(updateMemberRole(admin.id, team.id, memberId, "admin"))).code).toBe("forbidden");
    const ownerRow = (await getTeamForMember(owner.id, team.id)).member;
    expect((await rejection(updateMemberRole(owner.id, team.id, ownerRow.id, "member"))).code).toBe("forbidden");
  });
});
