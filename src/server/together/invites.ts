/**
 * Multi-person consent invites (model_shares).
 *
 * Flow: the requester invites an email -> the invitee signs in with that email, picks one of
 * their own READY models and accepts (consent record) -> the requester may combine that model
 * with their own in together photos (`assertModelsUsable`) until either party revokes or the
 * share expires (SHARE_TTL_DAYS). Sharing is one-directional: the invitee gets nothing of the
 * requester's; they can send their own invite.
 *
 * Invites are addressed by the emailed secret token (stored as sha256) or, for the signed-in
 * invitee only, by share id (in-app "Respond" links). Either way the signed-in email must match.
 */
import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { db, type Database, type Tx } from "@/db";
import { consentRecords, identityModels, modelShares, user as userTable } from "@/db/schema";
import type { ModelShareRow, UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { sendEmailSafe } from "@/server/email";
import { errors } from "@/server/http";
import { getOwnedModel } from "@/server/models/service";
import { assertTextAllowed } from "@/server/safety";
import type { InviteStatus } from "@/types/domain";
import {
  CONSENT_STATEMENT,
  CONSENT_VERSION,
  DAY_MS,
  INVITE_TTL_DAYS,
  MAX_PENDING_INVITES,
  SHARE_TTL_DAYS,
} from "./constants";
import { displayName, effectiveStatus, toReceivedInviteDTO, toSentInviteDTO } from "./dto";
import { assertInviteRateLimit } from "./rate-limit";
import type { CreateInviteRequest } from "./schemas";
import { hashInviteToken, inviteUrl, isShareId, maskEmail, normalizeEmail } from "./tokens";
import type { InviteListDTO, InvitePreview, ReceivedInviteDTO, SentInviteDTO } from "./types";

/** Where a consent decision came from (stored on consent_records). */
export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const LIST_LIMIT = 100;
const MAX_REF_LENGTH = 200;

const CLOSED_MESSAGES: Record<Exclude<InviteStatus, "pending">, string> = {
  accepted: "You already accepted this invite.",
  declined: "You declined this invite. Ask for a new one if you changed your mind.",
  revoked: "This invite was withdrawn.",
  expired: "This invite has expired. Ask for a new one.",
};

/* ───────────────────────────── create / list ───────────────────────────── */

/**
 * Invite `email` to share one of their models with `user`, and email them the link.
 * Re-inviting an address with a pending invite rotates its token (the old link stops working),
 * replaces the message and restarts the clock, without taking another pending slot.
 */
export async function createInvite(
  user: UserRow,
  input: CreateInviteRequest,
): Promise<{ invite: SentInviteDTO; resent: boolean; emailSent: boolean }> {
  const email = normalizeEmail(input.email);
  if (!email) throw errors.validation("Enter a valid email address.");
  if (email === normalizeEmail(user.email)) {
    throw errors.validation("You can't invite yourself. To combine two of your own models, just pick both.");
  }
  const message = input.message?.trim() || null;
  // Rate-limit first: every attempt (including blocked messages) counts, so moderation can't be spammed.
  await assertInviteRateLimit(user.id);
  if (message) await assertTextAllowed([message], { userId: user.id });

  const token = newToken();
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);

  const { row, resent } = await db.transaction(async (tx) => {
    // Serialize this user's invites so concurrent requests can't overshoot the pending cap.
    await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, user.id)).for("update");
    const pending = await tx
      .select()
      .from(modelShares)
      .where(
        and(
          eq(modelShares.requesterUserId, user.id),
          eq(modelShares.status, "pending"),
          gt(modelShares.expiresAt, now),
        ),
      );

    const existing = pending.find((r) => r.inviteeEmail === email);
    if (existing) {
      const [updated] = await tx
        .update(modelShares)
        .set({ tokenHash, message, expiresAt })
        .where(and(eq(modelShares.id, existing.id), eq(modelShares.status, "pending")))
        .returning();
      if (!updated) throw errors.conflict("This invite was just answered. Refresh to see it.");
      return { row: updated, resent: true };
    }
    if (pending.length >= MAX_PENDING_INVITES) {
      throw errors.conflict(
        `You have ${MAX_PENDING_INVITES} invites waiting for an answer. Withdraw one before inviting someone new.`,
      );
    }
    const [inserted] = await tx
      .insert(modelShares)
      .values({ requesterUserId: user.id, inviteeEmail: email, tokenHash, message, expiresAt })
      .returning();
    return { row: inserted!, resent: false };
  });

  const sent = await sendEmailSafe("multi_person_invite", email, {
    inviterName: displayName(user.name, user.email, "A friend"),
    message,
    url: inviteUrl(token),
  });
  return {
    invite: toSentInviteDTO(row, { ownerName: null, ownerEmail: null, modelName: null, modelDeleted: false }, now),
    resent,
    emailSent: sent !== null && sent.status !== "failed",
  };
}

/** Invites I sent, and invites addressed to my email / shares of my models (newest first). */
export async function listInvites(user: UserRow): Promise<InviteListDTO> {
  const now = new Date();
  const email = normalizeEmail(user.email);
  const [sentRows, receivedRows] = await Promise.all([
    db
      .select({
        share: modelShares,
        ownerName: userTable.name,
        ownerEmail: userTable.email,
        modelName: identityModels.name,
        modelDeletedAt: identityModels.deletedAt,
      })
      .from(modelShares)
      .leftJoin(userTable, eq(userTable.id, modelShares.ownerUserId))
      .leftJoin(identityModels, eq(identityModels.id, modelShares.modelId))
      .where(eq(modelShares.requesterUserId, user.id))
      .orderBy(desc(modelShares.createdAt))
      .limit(LIST_LIMIT),
    db
      .select({
        share: modelShares,
        requesterName: userTable.name,
        requesterEmail: userTable.email,
        modelName: identityModels.name,
        modelDeletedAt: identityModels.deletedAt,
      })
      .from(modelShares)
      .innerJoin(userTable, eq(userTable.id, modelShares.requesterUserId))
      .leftJoin(identityModels, eq(identityModels.id, modelShares.modelId))
      .where(
        and(
          // Invites addressed by email are only shown to accounts that proved they own that address.
          user.emailVerified
            ? or(eq(modelShares.inviteeEmail, email), eq(modelShares.ownerUserId, user.id))
            : eq(modelShares.ownerUserId, user.id),
          ne(modelShares.requesterUserId, user.id),
        ),
      )
      .orderBy(desc(modelShares.createdAt))
      .limit(LIST_LIMIT),
  ]);

  return {
    sent: sentRows.map((r) =>
      toSentInviteDTO(
        r.share,
        {
          ownerName: r.ownerName,
          ownerEmail: r.ownerEmail,
          modelName: r.modelName,
          modelDeleted: r.modelDeletedAt !== null,
        },
        now,
      ),
    ),
    received: receivedRows.map((r) =>
      toReceivedInviteDTO(
        r.share,
        {
          requesterName: r.requesterName,
          requesterEmail: r.requesterEmail,
          modelName: r.modelName,
          modelDeleted: r.modelDeletedAt !== null,
        },
        now,
      ),
    ),
  };
}

/* ───────────────────────────── respond ───────────────────────────── */

/** By emailed token, or by share id when the signed-in user is the invitee (or the sharing owner). */
async function findInvite(user: UserRow, ref: string): Promise<ModelShareRow | null> {
  const key = ref.trim();
  if (!key || key.length > MAX_REF_LENGTH) return null;
  const where = isShareId(key)
    ? and(
        eq(modelShares.id, key),
        or(eq(modelShares.inviteeEmail, normalizeEmail(user.email)), eq(modelShares.ownerUserId, user.id)),
      )
    : eq(modelShares.tokenHash, hashInviteToken(key));
  const [row] = await db.select().from(modelShares).where(where).limit(1);
  return row ?? null;
}

function isInvitee(user: UserRow, row: ModelShareRow): boolean {
  return normalizeEmail(user.email) === normalizeEmail(row.inviteeEmail) || row.ownerUserId === user.id;
}

async function toReceived(row: ModelShareRow): Promise<ReceivedInviteDTO> {
  const [[requester], [model]] = await Promise.all([
    db
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, row.requesterUserId))
      .limit(1),
    row.modelId
      ? db
          .select({ name: identityModels.name, deletedAt: identityModels.deletedAt })
          .from(identityModels)
          .where(eq(identityModels.id, row.modelId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return toReceivedInviteDTO(row, {
    requesterName: requester?.name ?? null,
    requesterEmail: requester?.email ?? "",
    modelName: model?.name ?? null,
    modelDeleted: Boolean(model?.deletedAt),
  });
}

/** What /invites/[ref] shows to the signed-in user. Never reveals more than a masked email to others. */
export async function getInvitePreview(user: UserRow, ref: string): Promise<InvitePreview> {
  const row = await findInvite(user, ref);
  if (!row) return { state: "not_found" };
  if (row.requesterUserId === user.id) return { state: "own_invite", inviteeEmail: row.inviteeEmail };
  if (!isInvitee(user, row)) return { state: "wrong_account", invitedEmail: maskEmail(row.inviteeEmail) };
  if (!user.emailVerified && row.ownerUserId !== user.id) return { state: "unverified" };
  const invite = await toReceived(row);
  return invite.status === "pending" ? { state: "pending", invite } : { state: "closed", invite };
}

/** Load a pending invite the signed-in user may answer, or throw the reason they can't. */
async function respondableInvite(user: UserRow, ref: string): Promise<ModelShareRow> {
  const row = await findInvite(user, ref);
  if (!row) throw errors.notFound("Invite");
  if (row.requesterUserId === user.id) {
    throw errors.forbidden("This is your own invite. Send the link to the person you invited.");
  }
  if (normalizeEmail(user.email) !== normalizeEmail(row.inviteeEmail)) {
    throw errors.forbidden("This invite was sent to a different email address. Sign in with that address to respond.");
  }
  if (!user.emailVerified) throw errors.forbidden("Verify your email address before responding to invites.");

  const status = effectiveStatus(row);
  if (status === "expired" && row.status === "pending") {
    await db
      .update(modelShares)
      .set({ status: "expired" })
      .where(and(eq(modelShares.id, row.id), eq(modelShares.status, "pending")));
  }
  if (status !== "pending") throw errors.conflict(CLOSED_MESSAGES[status]);
  return row;
}

/**
 * Accept as the invitee, sharing `modelId` (one of the invitee's own READY models). Records the
 * consent (IP, user agent, statement) for the model's owner.
 */
export async function acceptInvite(
  user: UserRow,
  ref: string,
  modelId: string,
  meta: RequestMeta = {},
): Promise<ModelShareRow> {
  const invite = await respondableInvite(user, ref);
  const model = await getOwnedModel(user.id, modelId);
  if (model.status !== "ready") throw errors.conflict(`"${model.name}" isn't ready yet. Finish setting it up first.`);

  const now = new Date();
  return db.transaction(async (tx) => {
    // Conditional on status + token: a concurrent answer, re-send or withdrawal updates nothing.
    const [accepted] = await tx
      .update(modelShares)
      .set({
        ownerUserId: user.id,
        modelId: model.id,
        status: "accepted",
        respondedAt: now,
        expiresAt: new Date(now.getTime() + SHARE_TTL_DAYS * DAY_MS),
      })
      .where(
        and(
          eq(modelShares.id, invite.id),
          eq(modelShares.status, "pending"),
          eq(modelShares.tokenHash, invite.tokenHash),
          gt(modelShares.expiresAt, now),
        ),
      )
      .returning();
    if (!accepted) throw errors.conflict("This invite was already answered or withdrawn.");
    await recordConsent(tx, accepted, "granted", meta, now);
    return accepted;
  });
}

export async function declineInvite(user: UserRow, ref: string): Promise<ModelShareRow> {
  const invite = await respondableInvite(user, ref);
  const [declined] = await db
    .update(modelShares)
    .set({ status: "declined", respondedAt: new Date() })
    .where(and(eq(modelShares.id, invite.id), eq(modelShares.status, "pending")))
    .returning();
  if (!declined) throw errors.conflict("This invite was already answered or withdrawn.");
  return declined;
}

/* ───────────────────────────── revoke ───────────────────────────── */

/**
 * Either party ends a share: the requester withdraws a pending invite or stops using an accepted
 * share; the owner stops sharing their model. Jobs already running finish; new jobs are refused
 * by `assertModelsUsable`. Idempotent for shares that are already closed.
 */
export async function revokeShare(user: UserRow, shareId: string, meta: RequestMeta = {}): Promise<ModelShareRow> {
  const [row] = await db
    .select()
    .from(modelShares)
    .where(
      and(
        eq(modelShares.id, shareId),
        or(eq(modelShares.requesterUserId, user.id), eq(modelShares.ownerUserId, user.id)),
      ),
    )
    .limit(1);
  if (!row) throw errors.notFound("Share");
  if (row.status !== "pending" && row.status !== "accepted") return row;

  const now = new Date();
  return db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(modelShares)
      .set({ status: "revoked" })
      .where(and(eq(modelShares.id, row.id), inArray(modelShares.status, ["pending", "accepted"])))
      .returning();
    if (!revoked) {
      const [current] = await tx.select().from(modelShares).where(eq(modelShares.id, row.id)).limit(1);
      return current ?? row;
    }
    if (row.status === "accepted" && row.ownerUserId) {
      await recordConsent(tx, row, "revoked", meta, now, user.id === row.ownerUserId ? "owner" : "requester");
    }
    return revoked;
  });
}

/** Consent audit trail (consent_records, kind "multi_person"), always attributed to the model owner. */
async function recordConsent(
  tx: Database | Tx,
  share: ModelShareRow,
  action: "granted" | "revoked",
  meta: RequestMeta,
  at: Date,
  revokedBy?: "owner" | "requester",
): Promise<void> {
  if (!share.ownerUserId) return;
  await tx.insert(consentRecords).values({
    userId: share.ownerUserId,
    modelId: share.modelId,
    kind: "multi_person",
    ipAddress: meta.ipAddress?.slice(0, 100) ?? null,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    evidence: {
      action,
      shareId: share.id,
      requesterUserId: share.requesterUserId,
      inviteeEmail: share.inviteeEmail,
      at: at.toISOString(),
      ...(action === "granted"
        ? { consentVersion: CONSENT_VERSION, statement: CONSENT_STATEMENT, expiresAt: share.expiresAt.toISOString() }
        : { revokedBy }),
    },
  });
}
