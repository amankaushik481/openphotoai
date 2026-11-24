/** Account DTO for the signed-in user (`/api/me`). */
import { z } from "zod";
import { shouldWatermark } from "@/config/plans";
import type { UserRow } from "@/db/types";
import type { MeDTO } from "@/types/domain";

/** MeDTO plus account preferences the settings page edits. */
export type MeResponseDTO = MeDTO & { marketingOptIn: boolean };

export function toMeDTO(u: UserRow, watermarkFreeTier: boolean): MeResponseDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image ?? null,
    role: u.role,
    credits: u.credits,
    plan: u.plan,
    hasPaid: u.hasPaid,
    watermark: shouldWatermark(u, watermarkFreeTier),
    createdAt: u.createdAt.toISOString(),
    marketingOptIn: u.marketingOptIn,
  };
}

export const updateMeRequest = z
  .object({
    name: z.string().trim().min(1, "Name can't be empty.").max(80, "Name is too long."),
    marketingOptIn: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateMeRequest = z.infer<typeof updateMeRequest>;
