import type { InviteStatus } from "@/types/domain";

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  pending: "Waiting",
  accepted: "Sharing",
  declined: "Declined",
  revoked: "Stopped",
  expired: "Expired",
};

/** Stamp tone per invite status (mono lab stamps; see `Stamp`). */
export const INVITE_STATUS_TONE: Record<InviteStatus, "ink" | "success" | "muted"> = {
  pending: "ink",
  accepted: "success",
  declined: "muted",
  revoked: "muted",
  expired: "muted",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Two-letter initials for avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
