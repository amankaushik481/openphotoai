import { createUploadFromRequest } from "@/server/media/uploads";
import { v1Operations } from "@/server/openapi/operations";
import { rateLimit } from "@/server/rate-limit";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Multipart `file` + `purpose` (reference | garment | mask): same behaviour as the web app's uploads. */
export const POST = v1Route(v1Operations.createUpload, async ({ req, user }) => {
  // Same per-account upload limit as the web app (on top of the per-key API limit).
  await rateLimit("uploadsPerMinute", `user:${user.id}`);
  return createUploadFromRequest(req, user);
});
