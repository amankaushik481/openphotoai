/** GET /api/billing/subscription → `{ subscription | null, plan, hasPaid, canManageBilling, provider }`. */
import { getBillingSummary } from "@/server/billing";
import { route } from "@/server/http";

export const GET = route({ auth: "user" }, async ({ user }) => getBillingSummary(user.id));
