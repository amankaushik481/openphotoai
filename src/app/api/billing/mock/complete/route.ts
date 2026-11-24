/**
 * POST /api/billing/mock/complete — test mode only (404 otherwise). `{ checkoutId }` → `{ ok, redirectUrl }`.
 * Pays the signed-in user's mock checkout by applying the same events a real provider would send.
 */
import { z } from "zod";
import { completeMockCheckout } from "@/server/billing";
import { assertMockPayments } from "@/server/billing/mock-checkout";
import { parseBody, route } from "@/server/http";

const bodySchema = z.object({ checkoutId: z.string().min(1).max(2048) });

export const POST = route({ auth: "user" }, async ({ req, user }) => {
  assertMockPayments();
  const { checkoutId } = await parseBody(req, bodySchema);
  await completeMockCheckout(user, checkoutId);
  return { ok: true, redirectUrl: "/app/billing?success=1" };
});
