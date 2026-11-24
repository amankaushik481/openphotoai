import { errors, route } from "@/server/http";
import { handleAIWebhook } from "@/server/jobs/engine";
import type { AIProviderName } from "@/types/domain";

const PROVIDERS: readonly AIProviderName[] = ["mock", "fal", "replicate"];

/** Allow time to download, safety-check and store outputs. */
export const maxDuration = 60;

/**
 * AI provider completion webhooks. The signature is verified on the raw body (401 when invalid);
 * duplicates are acknowledged with 200 so providers stop retrying.
 */
export const POST = route<{ provider: string }>({ auth: "public" }, async ({ req, params }) => {
  const provider = PROVIDERS.find((p) => p === params.provider);
  if (!provider) throw errors.notFound("Webhook");
  const rawBody = await req.text();
  return handleAIWebhook(provider, { headers: req.headers, rawBody, url: req.url });
});
