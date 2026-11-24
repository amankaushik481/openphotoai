/** GET /api/credits — current balance + paginated ledger (newest first). Session or API key. */
import { z } from "zod";
import { getBalance, listLedger } from "@/server/credits/ledger";
import { parseQuery, route } from "@/server/http";

const querySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route({ auth: "user_or_api" }, async ({ req, user }) => {
  const { cursor, limit } = parseQuery(req, querySchema);
  const [balance, page] = await Promise.all([getBalance(user.id), listLedger(user.id, { cursor, limit })]);
  return { balance, ledger: page.entries, nextCursor: page.nextCursor };
});
