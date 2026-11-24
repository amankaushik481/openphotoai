import { idempotencyKeyFrom } from "@/server/admin/request";
import { parseBody, route } from "@/server/http";
import { transferCredits } from "@/server/teams";
import { transferCreditsRequest } from "@/server/teams/schemas";

/**
 * Give credits from the team owner's balance to an active member (owner only). Send an
 * `Idempotency-Key` header to make retries safe: a replay returns the first transfer.
 */
export const POST = route<{ id: string }, "user">(
  { auth: "user", rateLimit: "creditTransfersPerHour" },
  async ({ req, user, params }) => {
    const idempotencyKey = idempotencyKeyFrom(req);
    const { memberUserId, amount } = await parseBody(req, transferCreditsRequest);
    return { transfer: await transferCredits(user, params.id, memberUserId, amount, { idempotencyKey }) };
  },
);
