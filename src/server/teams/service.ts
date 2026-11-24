/** Teams: create (Studio plan), list, detail, rename, delete. */
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { brandKits, teamMembers, teams, user as userTable } from "@/db/schema";
import type { TeamRow, UserRow } from "@/db/types";
import { errors } from "@/server/http";
import { canManage, getTeamForMember, getTeamForOwner, normalizeEmail } from "./access";
import { toBrandKitDTO, toTeamMemberDTO, toTeamSummaryDTO } from "./dto";
import type { TeamDetailDTO, TeamSummaryDTO } from "./types";

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw errors.validation("Give your team a name.");
  return trimmed;
}

/** Seats in the team owner's current plan (0 after a downgrade: existing members stay, no new invites). */
export async function teamSeatLimit(ownerId: string): Promise<number> {
  const [owner] = await db.select({ plan: userTable.plan }).from(userTable).where(eq(userTable.id, ownerId)).limit(1);
  return owner ? getPlan(owner.plan).limits.teamSeats : 0;
}

/**
 * Create a team owned by `user`, who becomes its first active member (role owner).
 * Requires a plan with team seats (Studio); a user owns at most one team.
 */
export async function createTeam(user: UserRow, name: string): Promise<TeamRow> {
  const plan = getPlan(user.plan);
  if (plan.limits.teamSeats <= 0) {
    throw errors.planLimit("Teams and brand kits are part of the Studio plan. Upgrade to create a team.");
  }
  const teamName = cleanName(name);

  return db.transaction(async (tx) => {
    // Lock the user row so two concurrent requests can't both create a team (no unique index on owner_id).
    await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, user.id)).for("update");
    const [existing] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.ownerId, user.id)).limit(1);
    if (existing) throw errors.conflict("You already own a team. Invite people to it instead.");

    const [team] = await tx.insert(teams).values({ ownerId: user.id, name: teamName }).returning();
    await tx.insert(teamMembers).values({
      teamId: team!.id,
      userId: user.id,
      email: normalizeEmail(user.email),
      role: "owner",
      status: "active",
    });
    return team!;
  });
}

/** Teams the user actively belongs to (owned first, then oldest first). */
export async function listMyTeams(userId: string): Promise<TeamSummaryDTO[]> {
  const rows = await db
    .select({ team: teams, role: teamMembers.role, ownerName: userTable.name, ownerEmail: userTable.email })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .innerJoin(userTable, eq(userTable.id, teams.ownerId))
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active")))
    .orderBy(asc(teams.createdAt));
  if (rows.length === 0) return [];

  const counts = await db
    .select({ teamId: teamMembers.teamId, n: count() })
    .from(teamMembers)
    .where(
      and(
        inArray(
          teamMembers.teamId,
          rows.map((r) => r.team.id),
        ),
        eq(teamMembers.status, "active"),
      ),
    )
    .groupBy(teamMembers.teamId);
  const countByTeam = new Map(counts.map((c) => [c.teamId, c.n]));

  return rows
    .map((r) =>
      toTeamSummaryDTO(r.team, {
        role: r.team.ownerId === userId ? "owner" : r.role,
        ownerName: r.ownerName || r.ownerEmail,
        memberCount: countByTeam.get(r.team.id) ?? 0,
      }),
    )
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

/** Team page data: members (pending invites only for managers), brand kits, seats. */
export async function getTeamDetail(userId: string, teamId: string): Promise<TeamDetailDTO> {
  const { team, member } = await getTeamForMember(userId, teamId);
  const isOwner = team.ownerId === userId;
  const role = isOwner ? "owner" : member.role;
  const manager = canManage(role);

  const [memberRows, kitRows, seats] = await Promise.all([
    db
      .select({ member: teamMembers, name: userTable.name, image: userTable.image })
      .from(teamMembers)
      .leftJoin(userTable, eq(userTable.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.createdAt)),
    db.select().from(brandKits).where(eq(brandKits.teamId, teamId)).orderBy(asc(brandKits.createdAt)),
    teamSeatLimit(team.ownerId),
  ]);

  const owner = memberRows.find((r) => r.member.userId === team.ownerId);
  const active = memberRows.filter((r) => r.member.status === "active");
  const visible = manager ? memberRows : active;

  return {
    team: {
      ...toTeamSummaryDTO(team, {
        role,
        ownerName: owner?.name || owner?.member.email || "",
        memberCount: active.length,
      }),
      seats,
      seatsUsed: memberRows.length,
    },
    me: { memberId: member.id, userId, role, isOwner, canManage: manager },
    members: visible.map((r) =>
      toTeamMemberDTO(r.member, r.member.status === "active" ? { name: r.name, image: r.image } : null),
    ),
    brandKits: kitRows.map((k) => toBrandKitDTO(k, team.name)),
  };
}

export async function renameTeam(userId: string, teamId: string, name: string): Promise<TeamRow> {
  await getTeamForOwner(userId, teamId, "rename the team");
  const [row] = await db
    .update(teams)
    .set({ name: cleanName(name) })
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, userId)))
    .returning();
  if (!row) throw errors.notFound("Team");
  return row;
}

/** Deletes the team, its memberships, pending invites and brand kits (FK cascade). Credits are untouched. */
export async function deleteTeam(userId: string, teamId: string): Promise<void> {
  await getTeamForOwner(userId, teamId, "delete the team");
  await db.delete(teams).where(and(eq(teams.id, teamId), eq(teams.ownerId, userId)));
}
