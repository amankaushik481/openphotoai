import { getOwnedMediaMany } from "@/server/gallery/media";
import { createMediaZipStream, readDownloadIds, zipFileName } from "@/server/gallery/zip";
import { route } from "@/server/http";

export const maxDuration = 300;

/** `{ ids }` (JSON or form POST) → streamed `application/zip` attachment. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const ids = await readDownloadIds(req);
  const rows = await getOwnedMediaMany(user.id, ids);
  return new Response(createMediaZipStream(rows), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
