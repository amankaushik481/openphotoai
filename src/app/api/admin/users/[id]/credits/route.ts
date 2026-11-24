/**
 * POST /api/admin/users/:id/credits { delta, note } — manual credit adjustment (either sign),
 * recorded in the ledger with the admin's id. Send `Idempotency-Key` to make retries safe.
 */
import { adminAdjust } from "@/server/credits/ledger";
import { idempotencyKeyFrom } from "@/server/admin/request";
import { adjustCreditsBody } from "@/server/admin/schemas";
import { parseBody, route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ req, user, params }) => {
  const key = idempotencyKeyFrom(req);
  const { delta, note } = await parseBody(req, adjustCreditsBody);
  const result = await adminAdjust(user.id, params.id, delta, note, key ? `admin:${user.id}:${key}` : undefined);
  return { balance: result.balance, applied: result.applied };
});
