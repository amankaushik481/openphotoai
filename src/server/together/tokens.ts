/** Invite token hashing, links and email helpers. */
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Only the sha256 of an invite token is stored. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** In-app links to an invite use the share id ("shr_..."); emailed links use the secret token. */
export function isShareId(ref: string): boolean {
  return /^shr_[0-9a-z]{1,40}$/.test(ref);
}

/** Link to the invite page (`/invites/<token-or-share-id>`). */
export function inviteUrl(ref: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/invites/${encodeURIComponent(ref)}`;
}

/** "jane.doe@example.com" -> "ja***@example.com". */
export function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
