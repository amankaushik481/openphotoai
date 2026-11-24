import { bulkMediaAction, bulkMediaRequest } from "@/server/gallery/media";
import { parseBody, route } from "@/server/http";

/** `{ action: favorite|unfavorite|move|delete|hide|unhide, ids (≤ 200), folderId? }` → `{ updated }` */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const body = await parseBody(req, bulkMediaRequest);
  return { updated: await bulkMediaAction(user.id, body) };
});
