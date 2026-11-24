/** GET /api/admin/users/:id — profile, balance, ledger, jobs, models, billing and moderation history. */
import { getUserDetail } from "@/server/admin";
import { route } from "@/server/http";

export const GET = route<{ id: string }, "admin">({ auth: "admin" }, async ({ params }) => {
  return getUserDetail(params.id);
});
