import { getBalance, listLedger } from "@/server/credits/ledger";
import { parseQuery } from "@/server/http";
import { v1Operations } from "@/server/openapi/operations";
import { v1CreditsQuery } from "@/server/openapi/queries";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Balance + paginated ledger (newest first). */
export const GET = v1Route(v1Operations.getCredits, async ({ req, user }) => {
  const { cursor, limit } = parseQuery(req, v1CreditsQuery);
  const [balance, page] = await Promise.all([getBalance(user.id), listLedger(user.id, { cursor, limit })]);
  return { balance, ledger: page.entries, nextCursor: page.nextCursor };
});
