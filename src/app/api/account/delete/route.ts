import { DELETION_LINK_TTL_HOURS, requestAccountDeletion } from "@/server/account/deletion-request";
import { route } from "@/server/http";

/** Emails a confirmation link; nothing is deleted until it's clicked. Max 3 requests per 24h. */
export const POST = route({ auth: "user" }, async ({ user }) => {
  const { expiresAt } = await requestAccountDeletion(user);
  return { ok: true, expiresAt: expiresAt.toISOString(), expiresInHours: DELETION_LINK_TTL_HOURS };
});
