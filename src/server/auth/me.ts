/** Account DTO for the signed-in user (`/api/me`). */
import { z } from "zod";
import { shouldWatermark } from "@/config/plans";
import { RATE_LIMITS, type RateLimitName } from "@/config/rate-limits";
import type { UserRow } from "@/db/types";
import { peekRateLimit } from "@/server/rate-limit";
import type { MeDTO } from "@/types/domain";

/** MeDTO plus account preferences the settings page edits. */
export type MeResponseDTO = MeDTO & { marketingOptIn: boolean };

/** The engine's daily draft limit for this user (smaller allowance before the first purchase). */
export function draftLimitName(u: Pick<UserRow, "hasPaid">): RateLimitName {
  return u.hasPaid ? "draftsPerDay" : "draftsPerDayFree";
}

/** Free drafts left today, read from the rate-limit counter without consuming one. */
export async function draftsRemainingFor(u: Pick<UserRow, "id" | "hasPaid">): Promise<number> {
  const name = draftLimitName(u);
  try {
    return (await peekRateLimit(name, `user:${u.id}`)).remaining;
  } catch (err) {
    // Informational only (the engine enforces the real limit on submit): never fail /api/me over it.
    console.warn("[me] draft allowance lookup failed:", err instanceof Error ? err.message : err);
    return RATE_LIMITS[name].limit;
  }
}

export function toMeDTO(u: UserRow, watermarkFreeTier: boolean, draftsRemaining?: number): MeResponseDTO {
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
    draftsRemaining: draftsRemaining ?? RATE_LIMITS[draftLimitName(u)].limit,
    createdAt: u.createdAt.toISOString(),
    marketingOptIn: u.marketingOptIn,
  };
}

/** `toMeDTO` with the live draft allowance. */
export async function loadMeDTO(u: UserRow, watermarkFreeTier: boolean): Promise<MeResponseDTO> {
  return toMeDTO(u, watermarkFreeTier, await draftsRemainingFor(u));
}

export const updateMeRequest = z
  .object({
    name: z.string().trim().min(1, "Name can't be empty.").max(80, "Name is too long."),
    marketingOptIn: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateMeRequest = z.infer<typeof updateMeRequest>;
