/** POST /api/billing/mock/cancel — test billing portal (mock mode only): cancel the user's subscription now. */
import { cancelMockSubscriptions } from "@/server/billing";
import { assertMockPayments } from "@/server/billing/mock-checkout";
import { route } from "@/server/http";

export const POST = route({ auth: "user" }, async ({ user }) => {
  assertMockPayments();
  return cancelMockSubscriptions(user);
});
