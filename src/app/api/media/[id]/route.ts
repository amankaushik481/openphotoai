import { deleteMediaRows, updateMedia, updateMediaRequest } from "@/server/gallery/media";
import { parseBody, route } from "@/server/http";
import { getOwnedMedia, toMediaDTO } from "@/server/media/service";

type Params = { id: string };

export const GET = route<Params, "user_or_api">({ auth: "user_or_api" }, async ({ user, params }) => {
  const row = await getOwnedMedia(user.id, params.id);
  return { media: await toMediaDTO(row) };
});

/** `{ isFavorite?, folderId? (null = no folder), hidden? }` */
export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const body = await parseBody(req, updateMediaRequest);
  const row = await updateMedia(user.id, params.id, body);
  return { media: await toMediaDTO(row) };
});

/** Real deletion: storage objects + share links + row. */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  const row = await getOwnedMedia(user.id, params.id);
  await deleteMediaRows(user.id, [row]);
  return { ok: true };
});
