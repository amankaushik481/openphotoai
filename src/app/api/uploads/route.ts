import { route } from "@/server/http";
import { createUploadFromRequest } from "@/server/media/uploads";

/**
 * Upload a pose/style reference, a garment (try-on) or a brush mask (multipart `file` + `purpose`).
 * References and garments are normalized and safety-checked; masks are kept as PNG.
 */
export const POST = route({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user }) =>
  createUploadFromRequest(req, user),
);
