import { revokeShare } from "@/server/gallery/share";
import { route } from "@/server/http";

/** Revoke a share link (the public page then 404s). */
export const DELETE = route<{ id: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  await revokeShare(user.id, params.id);
  return { ok: true };
});
