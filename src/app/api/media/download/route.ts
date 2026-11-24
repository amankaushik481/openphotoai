import { getOwnedMediaMany } from "@/server/gallery/media";
import { createMediaZipStream, readDownloadIds, zipFileName } from "@/server/gallery/zip";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const maxDuration = 300;

/** `{ ids }` (JSON or form POST) → streamed `application/zip` attachment. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  // Validated (incl. the same-origin check for form posts) before counting, so a cross-site page
  // can't burn the user's allowance.
  const ids = await readDownloadIds(req);
  await rateLimit("downloadsPerHour", `user:${user.id}`);
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
