import { v1Route } from "@/app/api/v1/_lib/handler";
import { listMedia, listMediaQuery } from "@/server/gallery/media";
import { parseQuery } from "@/server/http";
import { toMediaDTO } from "@/server/media/service";
import { v1Operations } from "@/server/openapi/operations";

/** `?folderId&favorite&kind&modelId&packId&batchId&showHidden&cursor&limit` (newest first), same as GET /api/media. */
export const GET = v1Route(v1Operations.listMedia, async ({ req, user }) => {
  const query = parseQuery(req, listMediaQuery);
  const page = await listMedia(user.id, query);
  return {
    media: await Promise.all(page.media.map(toMediaDTO)),
    nextCursor: page.nextCursor,
    ...(page.hiddenCount !== undefined ? { hiddenCount: page.hiddenCount } : {}),
  };
});
