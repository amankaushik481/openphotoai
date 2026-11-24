/**
 * Team + brand kit DTOs. Types only (no runtime imports), so client components may
 * `import type` them without pulling server code into the bundle.
 */
import type { AspectRatio, TeamRole } from "@/types/domain";

export type TeamMemberStatus = "invited" | "active";

export interface TeamSummaryDTO {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  /** The caller's role in this team. */
  role: TeamRole;
  /** Active members, owner included. */
  memberCount: number;
  createdAt: string;
}

export interface TeamMemberDTO {
  id: string;
  userId: string | null;
  email: string;
  /** Null until the invite is accepted. */
  name: string | null;
  image: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  createdAt: string;
}

export interface BrandKitDTO {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  backgroundPrompt: string;
  outfitPrompt: string;
  stylePrompt: string;
  lighting: string;
  aspectRatio: AspectRatio;
  basePackId: string | null;
  colorHex: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDetailDTO {
  team: TeamSummaryDTO & {
    /** Seats included in the owner's plan (0 when the owner downgraded). */
    seats: number;
    /** Active + invited members, owner included. */
    seatsUsed: number;
  };
  me: { memberId: string; userId: string; role: TeamRole; isOwner: boolean; canManage: boolean };
  /** Pending invites are only listed for owners/admins. */
  members: TeamMemberDTO[];
  brandKits: BrandKitDTO[];
}

/** What the join page shows for an invite link. */
export interface TeamInvitePreview {
  teamId: string;
  teamName: string;
  inviterName: string;
  /** The invited address (the holder of the link received it there). */
  email: string;
}

export interface CreditTransferResult {
  transferId: string;
  amount: number;
  /** The owner's balance after the transfer. */
  balance: number;
}
