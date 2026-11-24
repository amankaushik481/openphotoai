import { z } from "zod";
import { confirmAccountDeletion } from "@/server/account/deletion-request";
import { clientIp, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

const confirmDeletionRequest = z.object({ token: z.string().trim().min(1).max(200) }).strict();

/**
 * Public: the emailed token is the credential (the user may open the link on another device).
 * Rate limited per IP (its own limit, so it doesn't share a counter with abuse reports).
 */
export const POST = route({ auth: "public" }, async ({ req }) => {
  await rateLimit("accountDeleteConfirmPerHourPerIp", `ip:${clientIp(req)}`);
  const { token } = await parseBody(req, confirmDeletionRequest);
  const { status } = await confirmAccountDeletion(token);
  return { ok: true, status };
});
