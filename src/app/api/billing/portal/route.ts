/** POST /api/billing/portal → `{ url }` (customer portal: payment method, invoices, cancellation). */
import { openPortal } from "@/server/billing";
import { route } from "@/server/http";

export const POST = route({ auth: "user" }, async ({ user }) => openPortal(user));
