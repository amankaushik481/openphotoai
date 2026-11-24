/** Team membership checks shared by every team / brand kit operation. */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, type Database, type Tx } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import type { TeamMemberRow, TeamRow } from "@/db/types";
import { errors } from "@/server/http";
import type { TeamRole } from "@/types/domain";

export interface TeamAccess {
  team: TeamRow;
  /** The caller's active membership row. */
  member: TeamMemberRow;
}

/** Owners and admins manage members and brand kits; members only read. */
export function canManage(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The team plus the caller's ACTIVE membership. Anyone else (strangers, pending invitees)
 * gets not_found, so team ids can't be probed.
 */
export async function getTeamForMember(userId: string, teamId: string, tx: Database | Tx = db): Promise<TeamAccess> {
  const [row] = await tx
    .select({ team: teams, member: teamMembers })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.status, "active")))
    .limit(1);
  if (!row) throw errors.notFound("Team");
  return row;
}

/** Membership + owner/admin role, else forbidden (non-members still get not_found). */
export async function getTeamForManager(userId: string, teamId: string, action: string): Promise<TeamAccess> {
  const access = await getTeamForMember(userId, teamId);
  if (!canManage(access.member.role)) throw errors.forbidden(`Only the team owner or an admin can ${action}.`);
  return access;
}

/** Membership + ownership (checked against teams.owner_id, the source of truth). */
export async function getTeamForOwner(userId: string, teamId: string, action: string): Promise<TeamAccess> {
  const access = await getTeamForMember(userId, teamId);
  if (access.team.ownerId !== userId) throw errors.forbidden(`Only the team owner can ${action}.`);
  return access;
}
