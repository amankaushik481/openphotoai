import { deleteFolder, folderNameRequest, renameFolder } from "@/server/gallery/folders";
import { parseBody, route } from "@/server/http";

type Params = { id: string };

/** Rename: `{ name }`. */
export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { name } = await parseBody(req, folderNameRequest);
  return { folder: await renameFolder(user.id, params.id, name) };
});

/** Delete the folder; its media stay in the gallery. */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  await deleteFolder(user.id, params.id);
  return { ok: true };
});
