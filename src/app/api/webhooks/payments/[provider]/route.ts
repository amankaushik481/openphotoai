/**
 * POST /api/webhooks/payments/[provider] — Stripe / mock payment webhooks.
 * 404 unless `provider` is the configured PAYMENT_PROVIDER; 400 on a bad signature;
 * 200 `{ received, duplicate? }` once handled; 500 when the provider should redeliver.
 */
import { env } from "@/lib/env";
import { handlePaymentWebhook } from "@/server/billing";
import { errors, route } from "@/server/http";

export const POST = route<{ provider: string }, "public">({ auth: "public" }, async ({ req, params }) => {
  const provider = env.paymentProvider;
  if (params.provider !== provider) throw errors.notFound("Webhook");
  // The signature covers the exact bytes: read the raw text, never re-serialized JSON.
  const rawBody = await req.text();
  return handlePaymentWebhook(provider, { headers: req.headers, rawBody, url: req.url });
});
