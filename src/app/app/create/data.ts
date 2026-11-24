/** Server-side data for the generation pages (create, pack detail). */
import "server-only";
import type { UserRow } from "@/db/types";
import { draftLimitName, draftsRemainingFor } from "@/server/auth/me";
import { RATE_LIMITS } from "@/config/rate-limits";

export interface DraftAllowance {
  limit: number;
  remaining: number;
}

/**
 * Free drafts left today (same number as `MeDTO.draftsRemaining`, which the client refreshes after
 * each draft). Reads the counter without consuming a draft.
 */
export async function loadDraftAllowance(user: Pick<UserRow, "id" | "hasPaid">): Promise<DraftAllowance> {
  return { limit: RATE_LIMITS[draftLimitName(user)].limit, remaining: await draftsRemainingFor(user) };
}
