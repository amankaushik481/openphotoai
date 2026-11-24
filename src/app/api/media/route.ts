import { listMedia, listMediaQuery } from "@/server/gallery/media";
import { parseQuery, route } from "@/server/http";
import { toMediaDTO } from "@/server/media/service";

/** `?folderId&favorite&kind&modelId&packId&batchId&showHidden&cursor&limit` (newest first). */
export const GET = route({ auth: "user_or_api" }, async ({ req, user }) => {
  const query = parseQuery(req, listMediaQuery);
  const page = await listMedia(user.id, query);
  return {
    media: await Promise.all(page.media.map(toMediaDTO)),
    nextCursor: page.nextCursor,
    ...(page.hiddenCount !== undefined ? { hiddenCount: page.hiddenCount } : {}),
  };
});
