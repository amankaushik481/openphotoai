import { createShare, createShareRequest, listShares, listSharesQuery, toShareDTO } from "@/server/gallery/share";
import { parseBody, parseQuery, route } from "@/server/http";

/** `{ mediaId? | folderId?, expiresInDays? }` → `{ share: { id, token, url, ... } }` */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const body = await parseBody(req, createShareRequest);
  return { share: toShareDTO(await createShare(user.id, body)) };
});

/** Active links for `?mediaId` or `?folderId` (so the share dialog can copy or revoke them). */
export const GET = route({ auth: "user" }, async ({ req, user }) => {
  const query = parseQuery(req, listSharesQuery);
  return { shares: (await listShares(user.id, query)).map(toShareDTO) };
});
