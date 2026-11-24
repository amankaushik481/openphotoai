/** GET /api/admin/moderation — open reports + unreviewed safety events (newest first). */
import { listModerationQueue } from "@/server/admin";
import { route } from "@/server/http";

export const GET = route({ auth: "admin" }, async () => {
  return listModerationQueue();
});
