/** Brand kits as used by generation: membership-checked loading + prompt fragment. */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brandKits, teamMembers, teams } from "@/db/schema";
import type { BrandKitRow } from "@/db/types";
import { errors } from "@/server/http";
import { ASPECT_RATIOS, type AspectRatio } from "@/types/domain";

/** Load a brand kit the user may apply: they own its team or are an active member. Else not_found. */
export async function getUsableBrandKit(userId: string, brandKitId: string): Promise<BrandKitRow> {
  const [row] = await db
    .select({ kit: brandKits, ownerId: teams.ownerId })
    .from(brandKits)
    .innerJoin(teams, eq(teams.id, brandKits.teamId))
    .where(eq(brandKits.id, brandKitId))
    .limit(1);
  if (!row) throw errors.notFound("Brand kit");
  if (row.ownerId === userId) return row.kit;
  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, row.kit.teamId), eq(teamMembers.userId, userId), eq(teamMembers.status, "active")))
    .limit(1);
  if (!member) throw errors.notFound("Brand kit");
  return row.kit;
}

/** Comma-joined prompt fragment (background, outfit, style, lighting). */
export function brandKitPrompt(kit: BrandKitRow): string {
  return [kit.backgroundPrompt, kit.outfitPrompt, kit.stylePrompt, kit.lighting]
    .map((s) => s.trim().replace(/[.,;\s]+$/, ""))
    .filter(Boolean)
    .join(", ");
}

export function brandKitAspectRatio(kit: BrandKitRow): AspectRatio | undefined {
  return (ASPECT_RATIOS as readonly string[]).includes(kit.aspectRatio) ? (kit.aspectRatio as AspectRatio) : undefined;
}
