# Adding providers

Every external service OpenShoot talks to sits behind an interface in
[`src/providers/types.ts`](../src/providers/types.ts). [`src/providers/registry.ts`](../src/providers/registry.ts)
picks the implementation from the validated environment ([`src/lib/env.ts`](../src/lib/env.ts)), and the rest of
the app only ever calls the registry getters. Adding a provider means writing one adapter, wiring it in a few known
places and testing it against fakes. No feature code changes.

| Kind | Interface | Registry getter | Selected by | Shipped implementations |
|---|---|---|---|---|
| AI: images | `ImageProvider` | `getImageProvider()` | `AI_PROVIDER` | `mock`, `fal`, `replicate` |
| AI: training | `TrainingProvider` | `getTrainingProvider()` | `AI_PROVIDER` | same object as images |
| AI: video | `VideoProvider` | `getVideoProvider()` | `AI_PROVIDER` | same object as images |
| AI: existing jobs | `AsyncAIProvider` | `getAIProvider(name)` | the job's stored `provider` | |
| Face analysis | `FaceProvider` | `getFaceProvider()` | `FACE_PROVIDER` | `mock`, `local` (human), `rekognition` |
| Moderation | `ModerationProvider` | `getModerationProvider()` | `MODERATION_PROVIDER` | `mock`, `local` (nsfwjs + rules), `openai` |
| Payments | `PaymentProvider` | `getPaymentProvider()` | `PAYMENT_PROVIDER` | `mock`, `stripe` |
| Email | `EmailProvider` | `getEmailProvider()` | `EMAIL_PROVIDER` | `mock`, `resend` |
| Storage | `StorageProvider` | `getStorageProvider()` (= `getStorage()`) | `STORAGE_DRIVER` | `local`, `s3` |

## Rules for every adapter

1. **Cheap factory, lazy SDK.** Export `createXProvider(opts)` that only stores its options. Import SDKs and load
   models inside methods (`await import("sdk")`) and cache the client. The registry builds providers on first use,
   and `next build` must never need keys.
2. **Server-only.** Adapters live in `src/providers/<kind>/` and may start with `import "server-only"`. Never import
   them from client components.
3. **Read keys from the validated `env`, not `process.env`.** Add each variable to the Zod schema in `src/lib/env.ts` (with a
   `superRefine` rule that names what's missing when the provider is selected) and document it in `.env.example`:
   what it does, where to get it, required or optional.
4. **Model ids live in [`src/config/models.ts`](../src/config/models.ts) only**, with an estimated `costUsd` per call
   and a `unit`. Admin cost reporting (`src/server/jobs/costs.ts`) and the README cost table read them.
5. **Verify webhooks.** See [Webhook requirements](#webhook-requirements).
6. **Normalize, don't leak.** Return the provider-agnostic types from `types.ts`. Error messages end up in logs, on
   job rows and in the admin dashboard: never include keys or signed URLs, and keep raw provider payloads in
   `ProviderOutput.raw` (never shown to users).
7. **Fail loudly.** Throw on any failure; don't return partial or default results. Safety callers treat a throw as
   "blocked" (fail closed), the job engine refunds failed jobs.
8. **Keep provider-side safety on.** If a model has a safety checker or a safety tolerance, use its strictest
   setting (the fal adapter sets `enable_safety_checker`, and Nano Banana's `safety_tolerance` is `"1"`).
   OpenShoot's own checks run on every input and output regardless.
9. **Mock-first.** Tests never call paid APIs. Fake the SDK or `fetch` (see [Testing](#testing)).

## AI providers

### What to implement

One object usually implements all three interfaces (`ImageProvider & TrainingProvider & VideoProvider`); each
extends `AsyncAIProvider`:

| Method | Contract |
|---|---|
| `submit*(input, opts)` | Queue the work and return a `ProviderJobRef` `{ provider, endpoint, requestId }` quickly; never wait for the result. Pass `opts.webhookUrl` to the provider when present (it is omitted when the app runs on `localhost`). Throw `ProviderRequestError` from `src/providers/ai/shared/errors.ts` with `retryable` set (429/5xx/network: true; invalid input or policy refusal: false). |
| `getStatus(ref)` | Map the provider's state to `ProviderJobStatus`: `queued`, `running` (optional `progress`), `succeeded` with a `ProviderOutput`, `failed` with `error` and `retryable`, or `canceled`. Throw only for transient transport errors, so the engine polls again. |
| `cancel(ref)` | Best effort cancel at the provider. |
| `parseWebhook(req)` | Verify the signature over `req.rawBody`, then return `{ eventId, requestId, status? }`. Include `status` when the payload carries the final result; otherwise the engine calls `getStatus()`. |
| `uploadInput(bytes, type, name)` | Make bytes fetchable by the provider (its file storage). Used when OpenShoot's own storage isn't publicly reachable (local disk in development). |
| `fetchOutput(url)` | Download an output. Use `fetchOutputBytes()` from `src/providers/ai/shared/fetch-output.ts` (https only, timeout, 100 MB cap). |
| `submitTraining` / `deleteModel(modelRef)` | Train an identity from a zip of photos; `ProviderOutput.modelRef` is whatever `submitGenerate` needs later (LoRA URL, model version…). `deleteModel` must remove the provider-side weights when the API allows it; it runs on model and account deletion. |
| `promptHelper(input)` | Synchronous LLM call. Fall back to `buildTemplatePrompt()` (`src/providers/ai/shared/prompt-template.ts`) when the call fails. |

Inputs are described by `GenerateInput`, `EditInput` (`instruct`, `pose_copy`, `multi_person`), `InpaintInput`,
`UpscaleInput`, `TryOnInput`, `ImageToVideoInput` and `TalkingVideoInput`. Instant identity models arrive as an
`IdentityRef` with an empty `modelRef` and `referenceImageUrls` (route them to a multi-reference edit model);
trained ones carry `modelRef` and `triggerWord`. Shared helpers for prompts and sizes are in
`src/providers/ai/shared/`.

`requestId` is opaque to the engine and is matched against webhooks, so encode anything you need to poll later
(Replicate's adapter encodes `prediction` vs `training` and groups of predictions). A job that fans out into several
provider requests can't be completed by one webhook: attach no webhook and let polling finish it, as the Replicate
adapter does for multi-image jobs.

### Wiring checklist

- [ ] `src/types/domain.ts`: add the name to `AIProviderName` (a contract change: record it in
      [DECISIONS.md](DECISIONS.md)).
- [ ] `src/lib/env.ts`: add it to the `AI_PROVIDER` enum, add its keys, and a `superRefine` rule for missing keys.
- [ ] `.env.example`: document the keys.
- [ ] `src/config/models.ts`: add a `MODELS.<name>` block covering every `Capability`, and widen the
      `satisfies Record<"fal" | "replicate", …>` clause.
- [ ] `src/providers/ai/<name>.ts` (+ helpers in `src/providers/ai/<name>/`): `createXProvider(opts)`.
- [ ] `src/providers/registry.ts`: a `case` in `aiProvider()`.
- [ ] `src/app/api/webhooks/ai/[provider]/route.ts`: add the name to `PROVIDERS` so its webhooks are accepted.
- [ ] `scripts/lib/check-env.ts`: a line in `aiDetail()`.
- [ ] Tests in `tests/unit/providers/<name>/` and a registry case in `tests/unit/providers/registry.test.ts`.
- [ ] [MODELS.md](MODELS.md) and the README cost table: models, prices, sources.

### Skeleton

```ts
// src/providers/ai/acme.ts (illustrative: AcmeClient, isTransient and verifyAcmeSignature stand for your
// SDK and helpers; "acme" must also be added to AIProviderName and MODELS as listed above)
import "server-only";
import { MODELS, type Capability } from "@/config/models";
import type { ImageProvider, ProviderJobRef, SubmitOptions, TrainingProvider, VideoProvider } from "@/providers/types";
import { ProviderRequestError, WebhookVerificationError } from "@/providers/ai/shared/errors";
import { fetchOutputBytes } from "@/providers/ai/shared/fetch-output";

export function createAcmeProvider(opts: { apiKey: string }): ImageProvider & TrainingProvider & VideoProvider {
  let client: Promise<AcmeClient> | undefined;
  const getClient = () => (client ??= import("acme-sdk").then(({ Acme }) => new Acme({ apiKey: opts.apiKey })));

  async function submit(capability: Capability, input: Record<string, unknown>, o?: SubmitOptions): Promise<ProviderJobRef> {
    const endpoint = MODELS.acme[capability].id; // never hard-code model ids
    try {
      const job = await (await getClient()).jobs.create(endpoint, { input, webhook: o?.webhookUrl });
      return { provider: "acme", endpoint, requestId: job.id };
    } catch (err) {
      throw new ProviderRequestError({ provider: "acme", endpoint, message: "Acme rejected the request.", retryable: isTransient(err), cause: err });
    }
  }

  return {
    name: "acme",
    async getStatus(ref) {
      const job = await (await getClient()).jobs.get(ref.requestId);
      if (job.status === "succeeded") return { state: "succeeded", output: { images: job.images.map((url) => ({ url })) } };
      if (job.status === "failed") return { state: "failed", error: job.error, retryable: false };
      return { state: "running" };
    },
    async cancel(ref) { await (await getClient()).jobs.cancel(ref.requestId); },
    async parseWebhook(req) {
      if (!verifyAcmeSignature(req.headers, req.rawBody, opts.apiKey)) throw new WebhookVerificationError("Invalid Acme signature");
      const body = JSON.parse(req.rawBody) as { id: string; event_id: string };
      return { eventId: body.event_id, requestId: body.id };
    },
    uploadInput: async (bytes, contentType, filename) => (await getClient()).files.upload(bytes, { contentType, filename }),
    fetchOutput: (url) => fetchOutputBytes(url),
    submitTraining: (input, o) => submit("train", { zip_url: input.imagesZipUrl, trigger: input.triggerWord }, o),
    async deleteModel(modelRef) { await (await getClient()).models.delete(modelRef); },
    submitGenerate: (input, o) => submit(input.quality === "draft" ? "draft" : "generate", { prompt: input.prompt /* … */ }, o),
    // submitEdit, submitInpaint, submitUpscale, submitFaceRestore, submitRemoveBackground, submitTryOn,
    // promptHelper, submitImageToVideo, submitTalkingVideo …
  } as ImageProvider & TrainingProvider & VideoProvider; // drop the cast once every method exists
}
```

## Webhook requirements

Inbound webhooks are public endpoints, so every adapter must:

- **Verify the signature over the exact raw body** (`req.rawBody`; the routes read the raw text, capped at
  `BODY_LIMITS.webhook` (4 MB), and never re-serialize JSON). Use a constant-time comparison
  (`crypto.timingSafeEqual`).
- **Reject stale timestamps** when the scheme has one (the fal and Replicate adapters allow ±5 minutes).
- **Throw on anything invalid** (missing headers, bad signature, unparsable body). AI adapters throw
  `WebhookVerificationError` (the route answers 401); payment adapters throw `PaymentWebhookError` (400, or 500 with
  `retryable: true` when the event is genuine but couldn't be normalized yet, so the provider redelivers).
- **Return a stable, unique event id** (the provider's delivery id, or request id + status). The engine stores it
  in `webhook_events` and acknowledges duplicates with 200, so redeliveries are harmless.
- **Never trust ids in the payload for authorization.** AI webhooks are matched to a job by
  `(provider, providerRequestId)`; payment events resolve the user from ids OpenShoot put into its own checkout
  sessions (metadata) or from the stored customer id.
- **Not need a reachable app to work.** Webhooks are an optimization: jobs also complete through the lazy sync on
  `GET /api/jobs/:id`, `/api/cron/jobs` and `pnpm worker`. A provider without signed webhooks should submit without a
  webhook URL and rely on polling, rather than accept unsigned callbacks.

Examples to copy: `src/providers/ai/fal/webhook.ts` (ED25519 with a cached JWKS),
`src/providers/ai/replicate/webhook.ts` (Standard Webhooks HMAC), `src/providers/payment/stripe.ts`
(`constructEventAsync`) and `src/providers/mock/ai.ts` (HMAC keyed with the app secret).

## Payment providers

### Contract

`PaymentProvider` has five methods:

| Method | Contract |
|---|---|
| `createCheckout(input)` | Hosted checkout for a `CheckoutItem` (`plan` + `interval`, or `credit_pack`). Resolve the price and credits with `resolveCheckoutItem()` from [`src/server/billing/catalog.ts`](../src/server/billing/catalog.ts) (amounts from `src/config/plans.ts`). Put `input.userId` (and plan / interval / pack id) into the provider's metadata so webhooks can be attributed. Return `{ url, checkoutId }`. |
| `createPortal({ customerId, returnUrl })` | A page where users manage their subscription and payment method. |
| `parseWebhook(req)` | Verify, then normalize to a `PaymentEvent`. |
| `getSubscription(id)` | Current state as a `NormalizedSubscription`, or `null`. |
| `cancelSubscription(id)` | Cancel immediately (used when a plan is replaced and on account deletion). |

`PaymentEvent` is provider-agnostic, and [`src/server/billing/events.ts`](../src/server/billing/events.ts) applies
it idempotently (one transaction per event, ledger idempotency keys, out-of-order handling):

| Normalized event | Meaning |
|---|---|
| `checkout.completed` | A checkout was paid. `mode: "payment"` with `creditPackId` grants the pack; `mode: "subscription"` links the subscription (credits come from `invoice.paid`). `checkoutId` becomes `payments.providerPaymentId`, so it must equal the id later refunds refer to. |
| `subscription.updated` / `subscription.deleted` | New subscription state; map statuses onto `SubscriptionStatus` (`active`, `trialing`, `past_due`, `canceled`, …). |
| `invoice.paid` | A subscription period was paid: grants the plan's credits (12× for yearly). Set `billingReason` (`subscription_create`, `subscription_cycle`, `subscription_update`); proration invoices grant nothing. Set `totalCents` (total after discounts): a zero total (trial, 100% coupon) grants nothing. |
| `invoice.payment_failed` | Dunning signal. |
| `payment.refunded` | Cumulative `amountRefundedCents` for a recorded payment; credits are reversed proportionally. Include `subscriptionId` for invoice refunds: a full refund ends that subscription. |
| `payment.disputed` | A chargeback was opened: every credit the payment granted is reversed, its subscription ends and the account is flagged for review. |
| `payment.dispute_closed` | `won: true` restores the credits; otherwise the reversal stands. |
| `ignored` | Everything else (acknowledged with 200). |

Amounts are integer minor units (cents, paise); `currency` is lowercase ISO 4217. The user's provider customer id is
stored in `user.stripeCustomerId` whatever the provider (the column name predates other providers).

### Wiring checklist

- [ ] `src/types/domain.ts`: add the name to `PaymentProviderName` (contract change, record it in DECISIONS.md).
- [ ] `src/lib/env.ts`: `PAYMENT_PROVIDER` enum, keys, missing-key rule. `.env.example`: document them.
- [ ] `src/providers/payment/<name>.ts`: `create<Name>PaymentProvider(opts)`.
- [ ] `src/providers/registry.ts`: a `case` in `getPaymentProvider()`.
- [ ] The webhook URL is `/api/webhooks/payments/<name>`: the route answers only for the configured provider.
- [ ] Tests modeled on `tests/unit/billing/stripe-provider.test.ts` (fake SDK, signature cases, every event type) and
      `tests/unit/billing/apply-events.test.ts` (end-to-end effects on credits and plans).
- [ ] [SELF_HOSTING.md](SELF_HOSTING.md): dashboard setup, webhook URL and events.

### Lemon Squeezy (notes)

- Lemon Squeezy has no inline prices: create a product with variants for each plan interval and credit pack, and map
  them in env (like the optional `STRIPE_PRICE_*` pins).
- Create checkouts with the Checkouts API and pass the user id and item in `checkout_data.custom`; it comes back in
  webhooks as `meta.custom_data`.
- Webhooks are signed with HMAC-SHA256 of the raw body using the webhook's signing secret, sent in `X-Signature`
  (hex). The event name is in `meta.event_name` (and the `X-Event-Name` header); derive a stable event id from the
  event name, the resource id and its `updated_at`.
- Map `order_created` (one-time packs) → `checkout.completed`; `subscription_created` / `subscription_updated` /
  `subscription_cancelled` / `subscription_expired` → subscription events; `subscription_payment_success` →
  `invoice.paid`; `subscription_payment_failed` → `invoice.payment_failed`; `order_refunded` → `payment.refunded`.
  Lemon Squeezy is the merchant of record and handles disputes itself; check whether it notifies you of them.
- The customer portal URL is part of the subscription object (`urls.customer_portal`).

### Razorpay (notes)

- Plans must exist in Razorpay before subscriptions (create them once through the API and map ids in env). One-time
  credit packs can use Payment Links, which give a hosted `short_url` to redirect to; subscriptions also return a
  hosted `short_url` for the mandate.
- Put the user id and item in `notes`; it is echoed in webhook payloads.
- Webhooks carry `X-Razorpay-Signature`: HMAC-SHA256 of the raw body with the webhook secret, hex encoded. Use the
  `x-razorpay-event-id` header as the event id.
- Map `payment_link.paid` / `order.paid` → `checkout.completed`; `subscription.activated` / `subscription.updated` /
  `subscription.halted` / `subscription.cancelled` / `subscription.completed` → subscription events;
  `subscription.charged` → `invoice.paid`; `refund.processed` → `payment.refunded`; `payment.dispute.created` /
  `payment.dispute.won` / `payment.dispute.lost` → the dispute events.
- Amounts are in paise (minor units), which matches the contract. Razorpay has no hosted customer portal: return the
  app's billing page from `createPortal` and offer cancellation through `cancelSubscription`.

Verify event names and payload fields against the provider's current documentation before shipping; these notes are
a starting point, not a tested integration.

## Email providers

`EmailProvider` has one method, `send({ to, subject, html, text?, replyTo?, tags? })`, which returns the provider's
message id or throws. Templates are rendered by `sendEmail()` in [`src/server/email`](../src/server/email/index.ts),
which records every message in `email_outbox` and decides what a failure means (sign-in and account-deletion emails
surface errors to the user; others are logged).

To add Postmark, SES, SMTP or another service:

- [ ] Widen `EmailProvider["name"]` in `src/providers/types.ts` (contract change) and the `EMAIL_PROVIDER` enum in
      `src/lib/env.ts`, with a missing-key rule.
- [ ] `src/providers/email/<name>.ts`: lazy SDK import, map `tags` to the service's metadata (sanitize names and
      values), throw with a readable message on errors.
- [ ] Registry `case` in `getEmailProvider()`, passing `env.EMAIL_FROM`.
- [ ] Document the keys in `.env.example` and the domain setup in SELF_HOSTING.md.
- [ ] Remember the production rule in `env.ts`: a real AI provider requires a non-mock email provider.

## Safety providers

Face and moderation providers back the safety module, so the bar is higher (see [SAFETY.md](SAFETY.md) and
[SAFETY_PROVIDERS.md](SAFETY_PROVIDERS.md)):

- `FaceProvider.analyze` returns every face with a box, confidence, an **L2-normalized** embedding, age and head
  pose. `matchThreshold` must be calibrated for its embedding model (`scripts/calibrate-face.ts`). Embeddings from a
  different model never match stored consent embeddings, so switching providers means users retake their consent
  selfie.
- `ModerationProvider.checkText` / `checkImage` return `allowed` plus categories; a `sexual` or `minors` category
  blocks even when `allowed` is true. `detectPublicFigure` is optional.
- Throw on every failure; never return "allowed" when unsure.
- Add the name to the `FACE_PROVIDER` / `MODERATION_PROVIDER` enums. Do not weaken the invariant in `env.ts` that
  forbids mock safety providers with a real AI provider, and do not add any way to skip checks.

## Storage drivers

`StorageProvider` covers `put`, `get`, `exists`, `delete`, `deletePrefix` (account and model deletion rely on it)
and `getSignedUrl` (short-lived, optional download filename). Validate keys with `assertSafeKey` /
`assertSafePrefix` from `src/providers/storage/keys.ts`, and set `publiclyReachable` truthfully: when it is false,
provider inputs are uploaded through `uploadInput` instead of signed URLs. Most services are S3-compatible and work
with the existing `s3` driver; a new driver is wired in `src/server/storage/index.ts`.

## Testing

- **Unit-test the adapter with fakes.** Mock the SDK with `vi.mock("sdk", …)` or inject `fetch` through the factory
  options (the fal adapter accepts `fetch`, `now` and `jwksUrl`). Cover: request shapes per capability, status
  mapping (including `retryable`), signature verification (valid, tampered body, wrong secret, stale timestamp,
  missing headers), output normalization and error messages without secrets. See `tests/unit/providers/fal/`,
  `tests/unit/providers/replicate/` (with a fake Replicate client) and `tests/unit/billing/stripe-provider.test.ts`.
- **Test selection** in `tests/unit/providers/registry.test.ts` (adapters are replaced by tagged fakes there).
- **Run the app with your provider on mocks elsewhere.** Explicit `*_PROVIDER` values win over `MOCK_PROVIDERS`, so
  `MOCK_PROVIDERS=true AI_PROVIDER=acme` exercises only the new adapter in development. Engine-level tests can
  inject an instance with `setProviderOverrides({ image, training, video })`.
- **Never call a paid API from tests or CI.** Try the real service manually with small inputs, and record what you
  verified (and what is UNVERIFIED) in MODELS.md.
