/** model_shares rows -> client DTOs. */
import type { ModelShareRow } from "@/db/types";
import type { InviteStatus } from "@/types/domain";
import type { ReceivedInviteDTO, SentInviteDTO } from "./types";

/** Pending or accepted rows past `expiresAt` are expired, whether or not the cron has run yet. */
export function effectiveStatus(
  row: Pick<ModelShareRow, "status" | "expiresAt">,
  now: Date = new Date(),
): InviteStatus {
  if ((row.status === "pending" || row.status === "accepted") && row.expiresAt <= now) return "expired";
  return row.status;
}

export function displayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback: string,
): string {
  return name?.trim() || email?.trim() || fallback;
}

export function toSentInviteDTO(
  row: ModelShareRow,
  extra: { ownerName: string | null; ownerEmail: string | null; modelName: string | null; modelDeleted: boolean },
  now: Date = new Date(),
): SentInviteDTO {
  const status = effectiveStatus(row, now);
  return {
    id: row.id,
    inviteeEmail: row.inviteeEmail,
    status,
    message: row.message,
    partner:
      row.status === "accepted" && row.ownerUserId
        ? {
            name: displayName(extra.ownerName, extra.ownerEmail, row.inviteeEmail),
            modelId: extra.modelDeleted ? null : row.modelId,
            modelName: extra.modelDeleted ? null : extra.modelName,
          }
        : null,
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReceivedInviteDTO(
  row: ModelShareRow,
  extra: { requesterName: string | null; requesterEmail: string; modelName: string | null; modelDeleted: boolean },
  now: Date = new Date(),
): ReceivedInviteDTO {
  return {
    id: row.id,
    status: effectiveStatus(row, now),
    from: { name: displayName(extra.requesterName, extra.requesterEmail, "Someone"), email: extra.requesterEmail },
    message: row.message,
    model:
      row.status === "accepted" && row.modelId && !extra.modelDeleted
        ? { id: row.modelId, name: extra.modelName ?? "Your model" }
        : null,
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
