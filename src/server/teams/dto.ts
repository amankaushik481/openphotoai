/** Row -> DTO mappers for teams, members and brand kits. */
import type { BrandKitRow, TeamMemberRow, TeamRow } from "@/db/types";
import { ASPECT_RATIOS, type AspectRatio, type TeamRole } from "@/types/domain";
import type { BrandKitDTO, TeamMemberDTO, TeamSummaryDTO } from "./types";

const DEFAULT_ASPECT_RATIO: AspectRatio = "4:5";

function toAspectRatio(value: string): AspectRatio {
  return (ASPECT_RATIOS as readonly string[]).includes(value) ? (value as AspectRatio) : DEFAULT_ASPECT_RATIO;
}

export function toBrandKitDTO(kit: BrandKitRow, teamName: string): BrandKitDTO {
  return {
    id: kit.id,
    teamId: kit.teamId,
    teamName,
    name: kit.name,
    backgroundPrompt: kit.backgroundPrompt,
    outfitPrompt: kit.outfitPrompt,
    stylePrompt: kit.stylePrompt,
    lighting: kit.lighting,
    aspectRatio: toAspectRatio(kit.aspectRatio),
    basePackId: kit.basePackId,
    colorHex: kit.colorHex,
    createdAt: kit.createdAt.toISOString(),
    updatedAt: kit.updatedAt.toISOString(),
  };
}

export function toTeamMemberDTO(
  row: TeamMemberRow,
  profile: { name: string | null; image: string | null } | null,
): TeamMemberDTO {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: profile?.name || null,
    image: profile?.image ?? null,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTeamSummaryDTO(
  team: TeamRow,
  extra: { role: TeamRole; ownerName: string; memberCount: number },
): TeamSummaryDTO {
  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    ownerName: extra.ownerName,
    role: extra.role,
    memberCount: extra.memberCount,
    createdAt: team.createdAt.toISOString(),
  };
}
