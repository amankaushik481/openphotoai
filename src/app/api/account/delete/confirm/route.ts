import { createHash } from "node:crypto";
import { z } from "zod";
import { confirmAccountDeletion } from "@/server/account/deletion-request";
import { knownClientIp, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

const confirmDeletionRequest = z.object({ token: z.string().trim().min(1).max(200) }).strict();

/**
 * Public: the emailed token is the credential (the user may open the link on another device).
 * Rate limited per IP (its own limit, so it doesn't share a counter with abuse reports). Without a
 * known client IP the limit is per token instead: one deployment-wide bucket would let any client
 * block everyone's deletion with garbage tokens, and the 190-bit tokens can't be guessed anyway.
 */
export const POST = route({ auth: "public" }, async ({ req }) => {
  const ip = knownClientIp(req);
  if (ip) await rateLimit("accountDeleteConfirmPerHourPerIp", `ip:${ip}`);
  const { token } = await parseBody(req, confirmDeletionRequest);
  if (!ip) {
    const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 32);
    await rateLimit("accountDeleteConfirmPerHourPerIp", `token:${tokenKey}`);
  }
  const { status } = await confirmAccountDeletion(token);
  return { ok: true, status };
});
