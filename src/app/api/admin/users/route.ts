/** GET /api/admin/users?q&cursor&limit — search users (email, name or exact id), newest first. */
import { searchUsers } from "@/server/admin";
import { usersQuery } from "@/server/admin/schemas";
import { parseQuery, route } from "@/server/http";

export const GET = route({ auth: "admin" }, async ({ req }) => {
  const { q, cursor, limit } = parseQuery(req, usersQuery);
  return searchUsers(q, cursor, { limit });
});
