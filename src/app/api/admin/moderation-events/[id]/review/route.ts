/** POST /api/admin/moderation-events/:id/review — mark a safety event as reviewed. */
import { markEventReviewed } from "@/server/admin";
import { route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ user, params }) => {
  const event = await markEventReviewed(user.id, params.id);
  return { event: { id: event.id, reviewed: event.reviewed } };
});
