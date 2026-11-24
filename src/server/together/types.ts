/**
 * Client-safe DTOs for the Together (multi-person) feature. Type-only module: components import
 * these with `import type`.
 */
import type { IdentityModelDTO, InviteStatus } from "@/types/domain";

/** An invite I sent. `status` is effective: past-expiry pending/accepted rows read "expired". */
export interface SentInviteDTO {
  id: string;
  inviteeEmail: string;
  status: InviteStatus;
  message: string | null;
  /** The person who accepted and the model they shared (accepted invites only). */
  partner: { name: string; modelId: string | null; modelName: string | null } | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

/** An invite addressed to my email (or a share of one of my models). */
export interface ReceivedInviteDTO {
  id: string;
  status: InviteStatus;
  /** The requester. Their account email is shown so a display name can't impersonate someone. */
  from: { name: string; email: string };
  message: string | null;
  /** The model I shared (accepted invites only). */
  model: { id: string; name: string } | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface InviteListDTO {
  sent: SentInviteDTO[];
  received: ReceivedInviteDTO[];
}

/** A model someone shared with me, plus the share that authorizes it (revocable). */
export interface PartnerModelDTO extends IdentityModelDTO {
  shareId: string;
}

/** What the invite page (/invites/[ref]) can show to the signed-in user. */
export type InvitePreview =
  | { state: "not_found" }
  /** Signed in with a different email than the invited one (masked). */
  | { state: "wrong_account"; invitedEmail: string }
  /** The requester opened their own invite link. */
  | { state: "own_invite"; inviteeEmail: string }
  /** Already answered, withdrawn or expired. */
  | { state: "closed"; invite: ReceivedInviteDTO }
  | { state: "pending"; invite: ReceivedInviteDTO };
