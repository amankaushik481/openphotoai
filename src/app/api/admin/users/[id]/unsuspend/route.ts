/** POST /api/admin/users/:id/unsuspend — lift a suspension. */
import { unsuspendUser } from "@/server/admin";
import { route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ user, params }) => {
  const { unsuspended } = await unsuspendUser(user.id, params.id);
  return { unsuspended };
});
