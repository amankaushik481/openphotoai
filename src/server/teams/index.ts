/**
 * Teams, brand kits and credit transfers (Studio plan).
 *
 *   service.ts     createTeam, listMyTeams, getTeamDetail, renameTeam, deleteTeam
 *   members.ts     inviteMember, getInvitePreview, acceptInvite, removeMember, updateMemberRole
 *   brand-kits.ts  listTeamBrandKits, listBrandKitsForUser, createBrandKit, updateBrandKit, deleteBrandKit
 *   credits.ts     transferCredits
 *   access.ts      getTeamForMember (+ manager / owner variants)
 *
 * Generation applies kits through src/server/jobs/brand-kits.ts (getUsableBrandKit).
 */
export {
  canManage,
  getTeamForManager,
  getTeamForMember,
  getTeamForOwner,
  inviteExpiresAt,
  isInviteExpired,
  TEAM_INVITE_TTL_DAYS,
  type TeamAccess,
} from "./access";
export { createTeam, deleteTeam, getTeamDetail, listMyTeams, renameTeam, teamSeatLimit } from "./service";
export {
  acceptInvite,
  getInvitePreview,
  inviteMember,
  removeMember,
  teamInviteUrl,
  updateMemberRole,
} from "./members";
export {
  MAX_BRAND_KITS_PER_TEAM,
  createBrandKit,
  deleteBrandKit,
  listBrandKitsForUser,
  listTeamBrandKits,
  updateBrandKit,
} from "./brand-kits";
export { transferCredits } from "./credits";
export { toBrandKitDTO, toTeamMemberDTO, toTeamSummaryDTO } from "./dto";
export type * from "./types";
