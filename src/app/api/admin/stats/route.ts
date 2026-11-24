/** GET /api/admin/stats?days — dashboard statistics for the last `days` days (default 30). */
import { getStats } from "@/server/admin";
import { statsQuery } from "@/server/admin/schemas";
import { parseQuery, route } from "@/server/http";

export const GET = route({ auth: "admin" }, async ({ req }) => {
  const { days } = parseQuery(req, statsQuery);
  return { stats: await getStats({ days }) };
});
