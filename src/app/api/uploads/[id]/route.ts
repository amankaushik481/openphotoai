import { route } from "@/server/http";
import { deleteUpload } from "@/server/media/upload-retention";

/** Delete one of your uploads (reference / garment / mask) and its stored files. Uploads also expire after 30 days. */
export const DELETE = route<{ id: string }, "user">({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ user, params }) => {
  await deleteUpload(user.id, params.id);
  return { ok: true };
});
