import { parseQuery } from "@/server/http";
import { toMediaDTO } from "@/server/media/service";
import { v1Operations } from "@/server/openapi/operations";
import { v1ListMediaQuery } from "@/server/openapi/queries";
import { v1Route } from "@/app/api/v1/_lib/handler";
import { listMediaForUser } from "@/app/api/v1/_lib/media";

/** `?folderId&favorite&kind&modelId&packId&batchId&showHidden&cursor&limit` (newest first). */
export const GET = v1Route(v1Operations.listMedia, async ({ req, user }) => {
  const query = parseQuery(req, v1ListMediaQuery);
  const page = await listMediaForUser(user.id, query);
  return { media: await Promise.all(page.media.map(toMediaDTO)), nextCursor: page.nextCursor };
});
