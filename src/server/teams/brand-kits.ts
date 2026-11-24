/**
 * Brand kit CRUD. Members of a team read its kits; owners/admins create, edit and delete them.
 * Every prompt field passes the safety text gate before it is stored, because kits are appended
 * to every member's generation prompt (see src/server/jobs/brand-kits.ts).
 */
import { and, asc, count, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { brandKits, teamMembers, teams } from "@/db/schema";
import type { BrandKitRow } from "@/db/types";
import { AppError, errors } from "@/server/http";
import { getPack } from "@/server/packs/registry";
import { assertTextAllowed } from "@/server/safety";
import { canManage, getTeamForManager, getTeamForMember } from "./access";
import { toBrandKitDTO } from "./dto";
import {
  createBrandKitRequest,
  updateBrandKitRequest,
  type BrandKitPatch,
  type CreateBrandKitInput,
  type UpdateBrandKitInput,
} from "./schemas";
import type { BrandKitDTO } from "./types";

export const MAX_BRAND_KITS_PER_TEAM = 20;

function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw errors.validation("Invalid brand kit.", parsed.error.issues);
  return parsed.data;
}

/** Safety gate + pack existence for the fields being written. */
async function assertKitAllowed(userId: string, values: BrandKitPatch): Promise<void> {
  await assertTextAllowed(
    [values.name, values.backgroundPrompt, values.outfitPrompt, values.stylePrompt, values.lighting].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    ),
    { userId },
  );
  if (values.basePackId && !(await getPack(values.basePackId))) {
    throw errors.validation("Unknown pack.", [{ path: ["basePackId"], message: "Unknown pack." }]);
  }
}

/** Kits of one team (any active member). */
export async function listTeamBrandKits(userId: string, teamId: string): Promise<BrandKitDTO[]> {
  const { team } = await getTeamForMember(userId, teamId);
  const rows = await db.select().from(brandKits).where(eq(brandKits.teamId, teamId)).orderBy(asc(brandKits.createdAt));
  return rows.map((k) => toBrandKitDTO(k, team.name));
}

/** Kits of every team the user actively belongs to (what the generation UI offers). */
export async function listBrandKitsForUser(userId: string): Promise<BrandKitDTO[]> {
  const rows = await db
    .select({ kit: brandKits, teamName: teams.name })
    .from(brandKits)
    .innerJoin(teams, eq(teams.id, brandKits.teamId))
    .innerJoin(
      teamMembers,
      and(eq(teamMembers.teamId, brandKits.teamId), eq(teamMembers.userId, userId), eq(teamMembers.status, "active")),
    )
    .orderBy(asc(teams.name), asc(brandKits.name));
  return rows.map((r) => toBrandKitDTO(r.kit, r.teamName));
}

export async function createBrandKit(userId: string, teamId: string, input: CreateBrandKitInput): Promise<BrandKitDTO> {
  const values = validate(createBrandKitRequest, input);
  const { team } = await getTeamForManager(userId, teamId, "create brand kits");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(brandKits).where(eq(brandKits.teamId, teamId));
  if (n >= MAX_BRAND_KITS_PER_TEAM) {
    throw errors.planLimit(`A team can have up to ${MAX_BRAND_KITS_PER_TEAM} brand kits. Delete one to add another.`);
  }
  await assertKitAllowed(userId, values);

  const [row] = await db
    .insert(brandKits)
    .values({ ...values, teamId, basePackId: values.basePackId ?? null, colorHex: values.colorHex ?? null })
    .returning();
  return toBrandKitDTO(row!, team.name);
}

/** Load a kit for an owner/admin of its team. Non-members get not_found, plain members forbidden. */
async function getManagedKit(userId: string, kitId: string, action: string): Promise<{ kit: BrandKitRow; teamName: string }> {
  const [kit] = await db.select().from(brandKits).where(eq(brandKits.id, kitId)).limit(1);
  if (!kit) throw errors.notFound("Brand kit");
  const access = await getTeamForMember(userId, kit.teamId).catch((err: unknown) => {
    throw err instanceof AppError && err.code === "not_found" ? errors.notFound("Brand kit") : err;
  });
  if (!canManage(access.member.role)) throw errors.forbidden(`Only the team owner or an admin can ${action}.`);
  return { kit, teamName: access.team.name };
}

export async function updateBrandKit(userId: string, kitId: string, patch: UpdateBrandKitInput): Promise<BrandKitDTO> {
  const values: BrandKitPatch = validate(updateBrandKitRequest, patch);
  const { kit, teamName } = await getManagedKit(userId, kitId, "edit brand kits");
  await assertKitAllowed(userId, values);

  const [row] = await db
    .update(brandKits)
    .set(values)
    .where(and(eq(brandKits.id, kit.id), eq(brandKits.teamId, kit.teamId)))
    .returning();
  if (!row) throw errors.notFound("Brand kit");
  return toBrandKitDTO(row, teamName);
}

export async function deleteBrandKit(userId: string, kitId: string): Promise<void> {
  const { kit } = await getManagedKit(userId, kitId, "delete brand kits");
  await db.delete(brandKits).where(and(eq(brandKits.id, kit.id), eq(brandKits.teamId, kit.teamId)));
}
