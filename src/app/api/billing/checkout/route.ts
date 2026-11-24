/** POST /api/billing/checkout — `{ item: CheckoutItem }` → `{ url }` (provider checkout page). */
import { z } from "zod";
import { checkoutItemSchema, startCheckout } from "@/server/billing";
import { parseBody, route } from "@/server/http";

const bodySchema = z.object({ item: checkoutItemSchema });

export const POST = route({ auth: "user", rateLimit: "billingPerMinute" }, async ({ req, user }) => {
  const { item } = await parseBody(req, bodySchema);
  const { url } = await startCheckout(user, item);
  return { url };
});
