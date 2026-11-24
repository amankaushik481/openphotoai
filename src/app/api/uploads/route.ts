import { route } from "@/server/http";
import { createUploadFromRequest } from "@/server/media/uploads";

/**
 * Upload a pose/style reference, a garment (try-on) or a brush mask (multipart `file` + `purpose`).
 * References and garments are normalized, safety-checked and stored with every face blurred; masks are
 * classified and stored as a black/white PNG. Uploads expire after 30 days (DELETE /api/uploads/:id).
 */
export const POST = route({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user }) =>
  createUploadFromRequest(req, user),
);
