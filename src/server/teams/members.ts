/** Team invites (email + hashed token), joining, leaving, removing and promoting members. */
import { and, count, eq, ne } from "drizzle-orm";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { teamMembers, teams, user as userTable } from "@/db/schema";
import type { TeamMemberRow, TeamRow, UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/email";
import { AppError, errors } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import {
  getTeamForManager,
  getTeamForMember,
  getTeamForOwner,
  hashInviteToken,
  inviteExpiresAt,
  isInviteExpired,
  TEAM_INVITE_TTL_DAYS,
  normalizeEmail,
} from "./access";
import type { TeamInvitePreview } from "./types";

export function teamInviteUrl(token: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/teams/join/${encodeURIComponent(token)}`;
}

/**
 * Invite `email` to the team and email them a join link. Owners and admins only.
 * Seats (owner's plan) count active + invited members, owner included. Idempotent per email:
 * re-inviting a pending address rotates its token and re-sends (the old link stops working)
 * without taking another seat.
 */
export async function inviteMember(
  actor: UserRow,
  teamId: string,
  email: string,
): Promise<{ member: TeamMemberRow; resent: boolean }> {
  const address = normalizeEmail(email);
  if (!address) throw errors.validation("Enter a valid email address.");
  const { team } = await getTeamForManager(actor.id, teamId, "invite people");
  // Shared with multi-person invites; counted once the actor is allowed to invite at all.
  await rateLimit("invitesPerHour", `user:${actor.id}`);

  const token = newToken();
  const result = await db.transaction(async (tx) => {
    // Lock the team so concurrent invites can't overshoot the seat limit.
    const [locked] = await tx.select({ ownerId: teams.ownerId }).from(teams).where(eq(teams.id, teamId)).for("update");
    if (!locked) throw errors.notFound("Team");
    const [owner] = await tx.select({ plan: userTable.plan }).from(userTable).where(eq(userTable.id, locked.ownerId));
    const seats = owner ? getPlan(owner.plan).limits.teamSeats : 0;
    if (seats <= 0) throw errors.planLimit("The team owner's plan no longer includes teams. Upgrade to Studio to invite people.");

    const [existing] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.email, address)))
      .limit(1);
    if (existing?.status === "active") throw errors.conflict(`${address} is already on this team.`);
    if (existing) {
      // A fresh link also restarts the invite's expiry (createdAt = when the latest link was sent).
      const [row] = await tx
        .update(teamMembers)
        .set({ inviteTokenHash: hashInviteToken(token), createdAt: new Date() })
        .where(eq(teamMembers.id, existing.id))
        .returning();
      return { member: row!, resent: true };
    }

    const [{ used } = { used: 0 }] = await tx
      .select({ used: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    if (used >= seats) {
      throw errors.planLimit(`All ${seats} seats are taken. Remove a member or a pending invite to invite someone new.`);
    }
    const [row] = await tx
      .insert(teamMembers)
      .values({ teamId, email: address, role: "member", status: "invited", inviteTokenHash: hashInviteToken(token) })
      .returning();
    return { member: row!, resent: false };
  });

  await sendEmail("team_invite", address, {
    inviterName: actor.name.trim() || actor.email,
    teamName: team.name,
    url: teamInviteUrl(token),
    expiresInDays: TEAM_INVITE_TTL_DAYS,
  });
  return result;
}

async function findPendingInvite(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({ member: teamMembers, team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.inviteTokenHash, hashInviteToken(trimmed)), eq(teamMembers.status, "invited")))
    .limit(1);
  return row ?? null;
}

/** Join-page data for a pending invite; null when the link is unknown, rotated or already used. */
export async function getInvitePreview(token: string): Promise<TeamInvitePreview | null> {
  const invite = await findPendingInvite(token);
  if (!invite) return null;
  const [owner] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, invite.team.ownerId))
    .limit(1);
  return {
    teamId: invite.team.id,
    teamName: invite.team.name,
    inviterName: owner?.name.trim() || owner?.email || "A teammate",
    email: invite.member.email,
    expiresAt: inviteExpiresAt(invite.member.createdAt).toISOString(),
    expired: isInviteExpired(invite.member.createdAt),
  };
}

/**
 * Accept an invite as `user`. The signed-in email must match the invited address
 * (case-insensitive). Tokens are single-use: accepting clears the hash.
 */
export async function acceptInvite(user: UserRow, token: string): Promise<{ team: TeamRow }> {
  const invite = await findPendingInvite(token);
  if (!invite) throw errors.notFound("Invite");
  if (isInviteExpired(invite.member.createdAt)) {
    throw new AppError("not_found", "This invite has expired. Ask the team owner to send you a new one.", {
      reason: "expired",
    });
  }
  if (normalizeEmail(user.email) !== normalizeEmail(invite.member.email)) {
    throw errors.forbidden("This invite was sent to a different email address. Sign in with that address to join.");
  }
  // The address match only proves ownership once the email is verified (magic link / Google-verified).
  if (!user.emailVerified) throw errors.forbidden("Verify your email address before joining a team.");

  return db.transaction(async (tx) => {
    const [alreadyMember] = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, invite.team.id),
          eq(teamMembers.userId, user.id),
          eq(teamMembers.status, "active"),
          ne(teamMembers.id, invite.member.id),
        ),
      )
      .limit(1);
    if (alreadyMember) {
      await tx.delete(teamMembers).where(eq(teamMembers.id, invite.member.id));
      return { team: invite.team };
    }
    // Conditional on the same hash + status: a concurrent accept or a rotated token updates nothing.
    const [joined] = await tx
      .update(teamMembers)
      .set({ status: "active", userId: user.id, inviteTokenHash: null })
      .where(
        and(
          eq(teamMembers.id, invite.member.id),
          eq(teamMembers.status, "invited"),
          eq(teamMembers.inviteTokenHash, invite.member.inviteTokenHash ?? ""),
        ),
      )
      .returning({ id: teamMembers.id });
    if (!joined) throw errors.notFound("Invite");
    return { team: invite.team };
  });
}

/**
 * Remove a member or revoke a pending invite. Owners remove anyone but themselves, admins
 * remove plain members and invites, and any non-owner member may leave (remove themselves).
 */
export async function removeMember(
  actorId: string,
  teamId: string,
  memberId: string,
): Promise<{ left: boolean }> {
  const { team, member: me } = await getTeamForMember(actorId, teamId);
  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!target) throw errors.notFound("Member");
  if (target.role === "owner" || (target.userId !== null && target.userId === team.ownerId)) {
    throw errors.forbidden("The owner can't leave or be removed. Delete the team instead.");
  }

  const self = target.id === me.id;
  if (!self) {
    if (me.role !== "owner" && me.role !== "admin") {
      throw errors.forbidden("Only the team owner or an admin can remove members.");
    }
    if (me.role === "admin" && target.role === "admin") throw errors.forbidden("Only the owner can remove an admin.");
  }
  await db.delete(teamMembers).where(and(eq(teamMembers.id, target.id), eq(teamMembers.teamId, teamId)));
  return { left: self };
}

/** Promote a member to admin or demote an admin (owner only). */
export async function updateMemberRole(
  actorId: string,
  teamId: string,
  memberId: string,
  role: "admin" | "member",
): Promise<TeamMemberRow> {
  await getTeamForOwner(actorId, teamId, "change roles");
  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!target) throw errors.notFound("Member");
  if (target.role === "owner") throw errors.forbidden("The owner's role can't be changed.");
  const [row] = await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.id, target.id), eq(teamMembers.teamId, teamId)))
    .returning();
  return row!;
}
