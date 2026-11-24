import { createFolder, folderNameRequest, listFolders } from "@/server/gallery/folders";
import { parseBody, route } from "@/server/http";

export const GET = route({ auth: "user" }, async ({ user }) => ({ folders: await listFolders(user.id) }));

/** `{ name }` (≤ 60 chars; at most 100 folders). */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const { name } = await parseBody(req, folderNameRequest);
  return { folder: await createFolder(user.id, name) };
});
