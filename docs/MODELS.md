# OpenShoot model and provider reference

Snapshot date: 2026-11-24. Default provider: **fal.ai**. Alternate: **Replicate**.

## 0. How to read this document

Confidence tags used below:

- **[T]** Verified against the type map shipped in `@fal-ai/client@1.11.0` (published 2026-11-14), which contains the
  input/output schema of 1,433 fal endpoints, or against the `replicate@1.4.0` source. Endpoint IDs and parameter
  names tagged [T] are exact.
- **[R]** Code tested in this sandbox (Node 22.23.5).
- **[P]** Price taken from the provider's own model page, as indexed by search (fal.ai and replicate.com could not be
  fetched directly from the research sandbox, which blocks those hosts).
- **[A]** Price or detail from an aggregator or third-party page.
- **UNVERIFIED** Not confirmed. Check before relying on it.

All latencies are typical figures and are **UNVERIFIED** unless marked [R]. Re-check prices before launch: fal exposes
`GET https://api.fal.ai/v1/models/pricing?endpoint_id=<id>` (route seen in a community SDK; UNVERIFIED). Replicate
shows prices on each model page.

### 0.1 Defaults at a glance (fal)

| Capability | fal endpoint (default) | Est. cost |
|---|---|---|
| train | `fal-ai/flux-lora-fast-training` | $2.00 / 1000 steps [P] |
| generate | `fal-ai/flux-lora` | $0.035 / MP [P] |
| draft | `fal-ai/flux-lora` (8-12 steps, 512 px) | ~$0.035 (see B.2) |
| editMulti | `fal-ai/nano-banana-2/edit` | ~$0.08 / 1K image [P] |
| inpaint | `fal-ai/flux-lora/inpainting` | $0.035 / MP [A] |
| upscale | `clarityai/crystal-upscaler` | $0.016 / output MP [P] |
| faceRestore | `fal-ai/codeformer` | $0.0021 / MP [P] |
| removeBg | `fal-ai/birefnet/v2` | ~$0.002 (compute-second billing, UNVERIFIED) |
| imageToVideo | `fal-ai/kling-video/v3/standard/image-to-video` | $0.084 / s without audio [A] |
| tts | `fal-ai/minimax/speech-2.8-turbo` | $0.06 / 1k chars [P] |
| talkingVideo | `fal-ai/kling-video/ai-avatar/v2/standard` | $0.0562 / s [P] |
| tryOn | `fal-ai/fashn/tryon/v1.6` | $0.075 / generation [P] |
| llm | `openrouter/router` + `google/gemini-3.1-flash-lite` | $0.25 / $1.50 per 1M tokens [P] |
| nsfw | `fal-ai/x-ailab/nsfw` | $0.001 / image [P] |

**Next-generation track to A/B before launch:** FLUX 3 Image Klein (BFL, open weights, released 2026-10-15).
Train with `blackforestlabs/flux-3/klein/base/trainer` ($0.0043/step, so $4.30 for 1000 steps [P]). Generate with
`blackforestlabs/flux-3/klein/text-to-image/lora` ($0.012/MP [P]). Edit with the same LoRA through
`blackforestlabs/flux-3/klein/edit-image/lora` (up to 10 reference images) [T]. fal's own fine-tuning guide recommends
Klein for new projects. Its face-likeness quality is **UNVERIFIED**: the model is five weeks old, and the trainer has
neither auto-captioning nor face-masked loss. FLUX.1 stays the default until a side-by-side test on real selfies
confirms Klein matches it.

---

## A. Platform mechanics

### A.1 fal (`@fal-ai/client@1.11.0`)

Auth: `FAL_KEY` (or `FAL_KEY_ID` + `FAL_KEY_SECRET`) is read automatically from `process.env` [T]. Server-side only:
the client warns if credentials reach a browser. For browser uploads, use `@fal-ai/server-proxy@1.3.0`.

```ts
// src/lib/fal.ts
import "server-only";
import { fal } from "@fal-ai/client";
fal.config({ credentials: process.env.FAL_KEY });   // optional; env is auto-detected

// 1) Upload (returns a public https URL on fal's CDN). Files >90 MB use multipart automatically.
export async function uploadToFal(bytes: Uint8Array, type: string, name = "file") {
  return fal.storage.upload(new File([bytes], name, { type }), {
    lifecycle: { expiresIn: "7d" },          // "never"|"immediate"|"1h"|"1d"|"7d"|"30d"|"1y"|seconds
  });
}

// 2) Submit to the queue with a webhook (the client appends ?fal_webhook=<url-encoded>).
export async function submit(endpointId: string, input: Record<string, unknown>, jobId: string) {
  const { request_id } = await fal.queue.submit(endpointId as any, {
    input,
    webhookUrl: `${process.env.APP_URL}/api/webhooks/fal?job=${jobId}`,
    tags: { job: jobId },                    // cost attribution, sent as x-fal-tags (max 10 pairs)
    storageSettings: { expiresIn: "30d" },   // lifetime of generated outputs
    // priority: "low", startTimeout: 600,   // optional
  });
  return request_id;                          // persist; equals payload.request_id in the webhook
}

// 3) Poll (fallback when a webhook is late)
const st = await fal.queue.status("fal-ai/flux-lora", { requestId, logs: true });
// st.status: "IN_QUEUE" (queue_position) | "IN_PROGRESS" (logs) | "COMPLETED" (logs, metrics)

// 4) Result
const { data, requestId: rid } = await fal.queue.result("fal-ai/flux-lora", { requestId });
// data is typed per endpoint, e.g. data.images[0].url

// 5) Cancel (throws if it cannot be cancelled; running jobs may not stop)
await fal.queue.cancel("fal-ai/flux-lora", { requestId });

// Blocking helper for scripts/tests only:
const r = await fal.subscribe("fal-ai/flux-lora", { input: { prompt: "..." }, logs: true });
```

Zipping selfies for trainers (`fflate` is already a project dependency):

```ts
import { zipSync } from "fflate";
const zip = zipSync(Object.fromEntries(selfies.map((b, i) => [`img_${i}.jpg`, b])), { level: 0 });
const images_data_url = await uploadToFal(zip, "application/zip", "selfies.zip");
```

**Webhook payload** [T + fal docs]: one POST per finished request.

```ts
type FalWebhookPayload<T = unknown> = {
  request_id: string;
  gateway_request_id: string;
  status: "OK" | "ERROR";          // not the queue status
  payload: T | null;               // same shape as fal.queue.result(...).data
  error?: string;                  // present when status === "ERROR"
  payload_error?: string;          // payload is null because the output could not be serialized
};
```

Delivery rules (community SDK README that mirrors fal docs; UNVERIFIED): reply 2xx within 15 s. Timeouts, network
errors, 4xx and 5xx are retried with backoff (up to about 31 times). A 3xx counts as a permanent failure, so the
webhook URL must not redirect. Make handlers idempotent on `request_id`. Sender IP ranges are listed at
`https://api.fal.ai/v1/meta` (`webhook_ip_ranges`).

**Signature verification** [R]: fal signs with ED25519. The headers are `X-Fal-Webhook-Request-Id`,
`X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp` (unix seconds), and `X-Fal-Webhook-Signature` (hex, 64 bytes). The
signed message is `request_id + "\n" + user_id + "\n" + timestamp + "\n" + hex(sha256(rawBody))`. Public keys come
from the JWKS at `https://rest.fal.ai/.well-known/jwks.json` (older docs show `rest.alpha.fal.ai`). Cache the keys for
up to 24 h and accept a timestamp skew of up to 5 minutes. The function below was tested against locally generated
Ed25519 keys and rejects tampered bodies.

```ts
// src/lib/webhooks/fal.ts  (Node runtime only; uses node:crypto, no deps)
import crypto, { type KeyObject } from "node:crypto";

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
let cache: { keys: KeyObject[]; at: number } | null = null;

async function falKeys(force = false): Promise<KeyObject[]> {
  if (!force && cache && Date.now() - cache.at < 24 * 3600_000) return cache.keys;
  const jwks = (await (await fetch(JWKS_URL)).json()) as { keys: { kty: string; crv: string; x: string }[] };
  const keys = jwks.keys
    .filter((k) => k.kty === "OKP" && k.crv === "Ed25519" && k.x)
    .map((k) => crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }));
  cache = { keys, at: Date.now() };
  return keys;
}

export async function verifyFalWebhook(rawBody: Buffer, headers: Headers): Promise<boolean> {
  const reqId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const ts = headers.get("x-fal-webhook-timestamp");
  const sigHex = headers.get("x-fal-webhook-signature");
  if (!reqId || !userId || !ts || !sigHex) return false;
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  if (!/^[0-9a-f]{128}$/i.test(sigHex)) return false;
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const msg = Buffer.from([reqId, userId, ts, bodyHash].join("\n"), "utf8");
  const sig = Buffer.from(sigHex, "hex");
  for (const force of [false, true]) {                 // refetch once to pick up rotated keys
    if ((await falKeys(force)).some((k) => crypto.verify(null, msg, k, sig))) return true;
    if (cache && Date.now() - cache.at < 60_000) break; // do not hammer JWKS on forged requests
  }
  return false;
}

// app/api/webhooks/fal/route.ts
export const runtime = "nodejs";
export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());            // verify the RAW bytes; never re-serialize JSON
  if (!(await verifyFalWebhook(raw, req.headers))) return new Response("bad signature", { status: 401 });
  const evt = JSON.parse(raw.toString("utf8")) as FalWebhookPayload;
  const jobId = new URL(req.url).searchParams.get("job");
  // upsert by evt.request_id (idempotent), then enqueue post-processing
  return Response.json({ ok: true });
}
```

### A.2 Replicate (`replicate@1.4.0`, published 2025-11-17)

Auth: `REPLICATE_API_TOKEN` (default for `new Replicate()`). Webhook secret: `REPLICATE_WEBHOOK_SIGNING_SECRET`, fetched
once from `GET https://api.replicate.com/v1/webhooks/default/secret` → `{ "key": "whsec_..." }`, or with
`await replicate.webhooks.default.secret.get()` [T].

```ts
import "server-only";
import Replicate, { type Prediction, type Training } from "replicate";
export const replicate = new Replicate({ useFileOutput: false }); // plain URL strings instead of FileOutput streams

// Official models take `model`; community models need `version` (64-char hash).
const p = await replicate.predictions.create({
  model: "black-forest-labs/flux-dev-lora",          // OR version: "<hash>"
  input: { prompt: "photo of TOK man ...", lora_weights: weightsUrl },
  webhook: `${process.env.APP_URL}/api/webhooks/replicate?job=${jobId}`,
  webhook_events_filter: ["completed"],              // "start" | "output" | "logs" | "completed"
});
const again: Prediction = await replicate.predictions.get(p.id); // status: starting|processing|succeeded|failed|canceled
await replicate.predictions.cancel(p.id);

// Resolve the latest version of a community model at runtime (cache it). Avoids hard-coding stale hashes.
export async function latestVersion(owner: string, name: string) {
  const m = await replicate.models.get(owner, name);
  return m.latest_version!.id;   // m.latest_version.openapi_schema also documents input/output for validation
}

// File upload: pass a Blob, Buffer or File in `input` (the client uploads it automatically, 100 MiB max),
// or upload explicitly. Files expire after 24 h; use your own S3/R2 URL for anything longer-lived.
const f = await replicate.files.create(new Blob([zipBytes], { type: "application/zip" }));
const zipUrl = f.urls.get;

// Training into a destination model, which must already exist (create once per user, or reuse one model per user).
await replicate.models.create(owner, `shoot-${userId}`, { visibility: "private", hardware: "gpu-h100" }); // hardware SKU: replicate.hardware.list()
const t: Training = await replicate.trainings.create(
  "replicate", "fast-flux-trainer", await latestVersion("replicate", "fast-flux-trainer"),
  {
    destination: `${owner}/shoot-${userId}`,
    input: { input_images: zipUrl, trigger_word: "TOK", lora_type: "subject" }, // names per model page [A]
    webhook: `${process.env.APP_URL}/api/webhooks/replicate?training=${userId}`,
    webhook_events_filter: ["completed"],
  },
);
// t.output (when succeeded) = { version: "owner/name:hash", weights: "https://replicate.delivery/.../*.tar|safetensors" } [T]
```

**Webhook verification** [R]: Replicate uses the Standard Webhooks scheme. The headers are `webhook-id`,
`webhook-timestamp` and `webhook-signature` (space-separated `v1,<base64>` entries). The signed content is
`${id}.${timestamp}.${rawBody}`, using HMAC-SHA256 keyed with the base64-decoded part of the secret after `whsec_`.
The function below was checked against `validateWebhook` from the `replicate` package, and both returned the same
result.

```ts
import crypto from "node:crypto";
export function verifyReplicateWebhook(rawBody: Buffer, headers: Headers, secret = process.env.REPLICATE_WEBHOOK_SIGNING_SECRET!) {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;                 // replay window
  const key = Buffer.from(secret.split("_").pop()!, "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${rawBody.toString("utf8")}`).digest();
  return sigs.split(" ").some((part) => {
    const [v, b64] = part.split(",");
    const given = Buffer.from(b64 ?? "", "base64");
    return v === "v1" && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
// Equivalent one-liner: `await validateWebhook(request.clone(), secret)` from "replicate" (Web Request objects).
```

The webhook body is the full Prediction or Training JSON (`id`, `status`, `output`, `error`, `metrics.predict_time`, ...).

---

## B. Capabilities

For each capability the table gives the endpoint, key inputs, the output path, price, and typical latency. fal output
paths are relative to `data` (from `queue.result`) or `payload` (from the webhook).

### B.1 Personal identity training (10-30 selfies)

| | fal default | fal next-gen (A/B) | Replicate default |
|---|---|---|---|
| ID | `fal-ai/flux-lora-fast-training` [T] | `blackforestlabs/flux-3/klein/base/trainer` [T] | `replicate/fast-flux-trainer` (version: resolve latest; newest prefix `56cb4a64` [A]) |
| Base model | FLUX.1 [dev] | FLUX 3 Image Klein Base (5.6B) | FLUX.1 [dev] |
| Inputs | `images_data_url` (zip URL), `trigger_word`, `steps`, `create_masks` (default true, face-mask-weighted loss), `is_style` (false for people) | `images_data_url` (zip with optional `ROOT.txt` captions), `trigger_phrase` (caption for every image without a .txt), `steps` (100-10000, default 1000), `learning_rate` (1e-4), `resolution` 512/768/1024 | `input_images` (zip URL), `trigger_word`, `lora_type: "subject"` (names [A]) |
| Output | `diffusers_lora_file.url` (+ `config_file.url`) | `lora_file.url` (+ `config_file.url`) | `training.output.weights` (LoRA URL) and `.version` (runnable destination model) |
| Price | $2 per run at 1000 steps, linear in steps [P] | $0.0043/step, 100-step minimum, so $4.30 at 1000 [P] | 8x H200 at $0.0122/s, ~2 min, so ~$1.5 [A] |
| Latency | ~2-5 min (UNVERIFIED) | UNVERIFIED (est. 10-20 min) | ~2-3 min [A] |

Other trainers on fal for reference: `fal-ai/flux-lora-portrait-trainer` ($0.0024/step, 1000-step minimum, default
2500 steps so $6 [P]; fal says it gives higher quality but less predictable identity than fast-training).
`fal-ai/flux-2-trainer-v2` (FLUX.2 dev, ~$6.40/1000 steps [A]). `fal-ai/flux-2-klein-9b-base-trainer`.
`fal-ai/qwen-image-2512-trainer` and `-v2` (~$0.95/1000 steps [P]; community tests rank Qwen-Image highest for
character likeness [A]). `fal-ai/z-image-turbo-trainer-v2`. On Replicate: `ostris/flux-dev-lora-trainer` (H100 at
~$0.0015/s; newest version prefix `26dce37a` [A]) and `simpletuner/flux-3-klein-image` (L40S, new and untested).

Trigger word handling:

- Use a rare token that is not a real name (`ohwx`, `TOK`), and always put it into prompts as
  `"photo of ohwx <man|woman|person>, ..."`.
- fal fast-training auto-captions the images and inserts `trigger_word`. If the zip contains `.txt` captions, those
  are used as-is, and the trigger is used only where no caption exists.
- Klein does not auto-caption. Either set `trigger_phrase: "a photo of ohwx person"` (every image then shares one
  caption, which risks overfitting clothing and backgrounds), or write `ROOT.txt` captions that contain the trigger.
  Captions can come from `openrouter/router/vision`.
- Dataset: 15-30 images, varied angles, lighting and outfits, one person, no sunglasses. Fewer than 10 usually
  under-trains identity [A]. Run the local safety checks (section C) before paying for training.

### B.2 Generation with the trained LoRA, and the draft variant

**fal default:** `fal-ai/flux-lora` [T]

- Inputs: `prompt`, `loras: [{ path: diffusers_lora_file.url, scale: 1 }]` (any number of LoRAs), `image_size`
  (preset or `{width,height}`), `num_inference_steps` (default 28), `guidance_scale` (3.5), `num_images`, `seed`,
  `acceleration` ("none" | "regular"), `output_format`, `enable_safety_checker`.
- Output: `images[0].url`, `has_nsfw_concepts[0]`, `seed`.
- Price: $0.035 per MP. fal's page says billing rounds up to the nearest megapixel [P], so keep sizes at or below
  1024x1024-equivalent pixels (for example `{width: 896, height: 1152}`). Latency: ~3-8 s (UNVERIFIED).

**fal draft ("instant preview"):** the same endpoint with `num_inference_steps: 8-12`, `acceleration: "regular"` and
`image_size: {width: 512, height: 640}`. It is about 3-4x faster. Under megapixel round-up billing it costs **about
the same** as a full render (~$0.035). Re-render the chosen draft at full size with the same `seed`.
`fal-ai/flux-lora/stream` [T] streams intermediate previews, which makes a cheap progress UI. On the Klein track,
`blackforestlabs/flux-3/klein/text-to-image/lora` [T] (distilled, fixed step count, `loras` up to 3, scale 0-4) costs
$0.012/MP, so a 512x640 draft is about $0.004. Set `enable_prompt_expansion: false` there (the default is true), or
expansion may dilute the trigger phrase. `.../klein/base/text-to-image/lora` costs $0.035/MP [P].

**Replicate default:** `black-forest-labs/flux-dev-lora` (official, no version needed) with
`lora_weights: training.output.weights`. Other inputs: `prompt`, `lora_scale`, `num_inference_steps`, `guidance`,
`aspect_ratio`, `megapixels` ("1" | "0.25"), `go_fast`, `num_outputs`, `seed`, `output_format`,
`disable_safety_checker` (names UNVERIFIED; validate against `openapi_schema`). Output: `string[]` of URLs. Price:
$0.032/image [P]. The draft uses `num_inference_steps: 8`, `megapixels: "0.25"`, `go_fast: true` (faster; whether it
is cheaper is UNVERIFIED). You can also run the destination model `training.output.version`: models from the ostris
trainer expose `model: "dev" | "schnell"` (schnell needs ~4 steps), `lora_scale`, `extra_lora` and `image`+`mask` [A].

### B.3 Reference-guided generation and multi-image editing

Used for pose copy, outfit, background, hair and expression edits, and for combining two people.

**fal default:** `fal-ai/nano-banana-2/edit` (Gemini 3.1 Flash Image) [T]

- Inputs: `prompt`, `image_urls: string[]` (up to 14 references), `resolution` ("0.5K" | "1K" | "2K" | "4K"),
  `aspect_ratio` ("auto", "4:5", ...), `num_images`, `seed`, `safety_tolerance` ("1"-"6", default "4"),
  `thinking_level` ("minimal" | "high"), `system_prompt`, `output_format`.
- Output: `images[0].url`, `description`.
- Price: ~$0.06 (0.5K), $0.08 (1K), $0.12 (2K) per image [P]. Latency: ~8-20 s (UNVERIFIED).
- Identity: keeps character identity for up to 5 people [P]. For edits of the user, pass the user's best generated
  image plus 2-3 selfies as references and say which image is which ("the person in image 1 ...").

Alternatives (all [T]):

- `google/nano-banana-2.1/edit`: newer. fal pages disagree on price: per-token billing at ~$0.04/1K, or a flat $0.08.
  UNVERIFIED.
- `bytedance/seedream/v5/pro/edit`: up to 10 refs. $0.0675 plus $0.0045 per extra input image at ≤1536² [P].
  Output `images[0].url`.
- `blackforestlabs/flux-3/edit-image`: up to 10 refs, $0.048/1K or $0.024/MP. The sources conflict.
- `fal-ai/flux-2/edit`, `fal-ai/flux-pro/kontext/max/multi`.
- On the Klein track, `blackforestlabs/flux-3/klein/edit-image/lora` takes `image_urls` (up to 10) plus the user's
  `loras`. It is the strongest option for identity-locked edits if Klein passes the A/B test.

**Replicate default:** `google/nano-banana-2`. Inputs: `prompt`, `image_input: string[]` (up to 14), `resolution`,
`aspect_ratio`, `output_format`. Output: a URL. Price: UNVERIFIED (~$0.067-0.08). The cheaper alternative is
`bytedance/seedream-5-pro` (`image_input` up to 10, $0.045 at 1K and $0.09 at 2K [P]). Others: `google/nano-banana-pro`
(~$0.15 [A]) and `black-forest-labs/flux-2-pro` (`input_images` up to 8).

### B.4 Inpainting with a mask

**fal default:** `fal-ai/flux-lora/inpainting` [T]. Its inputs are `image_url`, `mask_url` (white = repaint),
`prompt` and `loras` (the user's LoRA, so repainted faces stay on-identity), plus `strength` (default 0.85),
`num_inference_steps`, `guidance_scale` and `seed`. Output: `images[0].url`. Price: $0.035/MP [A]. The generic
alternative is `fal-ai/flux-pro/v1/fill` [T]: `image_url`, `mask_url` (same dimensions), `prompt`,
`safety_tolerance`; $0.05/MP [P]. Instruction edits (B.3) remove the need for masks in many cases.

**Replicate default:** `black-forest-labs/flux-fill-pro`. Inputs: `image`, `mask`, `prompt` (plus `steps`, `guidance`
and `safety_tolerance`, UNVERIFIED). Output: a URL. Price: $0.05/image [P]. For identity-aware inpainting, call the
trained destination model with `image` + `mask` (black areas are kept, white areas are inpainted) [A].

### B.5 Upscaling and face restoration

| | fal | Replicate |
|---|---|---|
| Upscale (portraits) | `clarityai/crystal-upscaler` [T]: `image_url`, `scale_factor` (default 2), `creativity`, `output_format`; output `images[0].url`; $0.016 per **output** MP, so a 2x of a 1 MP image (4 MP) costs $0.064 [P]; ~10-30 s | `philz1337x/crystal-upscaler` (price UNVERIFIED) or `topazlabs/image-upscale` ($0.05/unit [P]; unit definition UNVERIFIED) |
| Upscale (cheap, general) | `fal-ai/seedvr/upscale/image` [T]: `image_url`, `upscale_mode` "factor" or "target", `upscale_factor` (2), `target_resolution` ("1080p" ... "2160p"); output `image.url`; $0.001/MP [P] | `recraft-ai/recraft-crisp-upscale` ($0.04 [P]) |
| Face restore | `fal-ai/codeformer` [T]: `image_url`, `fidelity` (0.5), `upscale_factor` (2), `face_upscale`, `only_center_face`; output `image.url`; $0.0021/MP [P] | `sczhou/codeformer` (community, so resolve the version at runtime; price UNVERIFIED, GPU-second billing). Alternative: `tencentarc/gfpgan` |

Other options: `topaz/upscale/image/precision` and `topaz/restore/image` on fal [T], and
`fal-ai/image-editing/face-enhancement` [T]. CodeFormer can shift identity at low `fidelity`, so use 0.7 or higher on
the user's face.

### B.6 Background removal

**fal default:** `fal-ai/birefnet/v2` [T]. Inputs: `image_url`, `model: "Portrait"` (or "General Use (Light)" /
"Matting"), `operating_resolution` ("1024x1024" | "2048x2048"), `refine_foreground`, `output_mask`, `output_format`.
Output: `image.url` (and `mask_image.url`). Billing is per compute second (~$0.0008/s [A]), so roughly $0.001-0.003
per image (UNVERIFIED). Latency: ~1-3 s. Per-image alternatives: `fal-ai/bria/background/remove` ($0.018 [A]) and
`pixelcut/background-removal` ($0.016 [A]).

**Replicate default:** `men1scus/birefnet` with version
`f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7` (marked Latest on the versions page [A]). Input:
`image`. Output: a URL. Price: UNVERIFIED (GPU seconds).

### B.7 Image-to-video short clips

**fal default:** `fal-ai/kling-video/v3/standard/image-to-video` [T]

- Inputs: `start_image_url`, `prompt` (or `multi_prompt` for shots), `duration` ("3"-"15", default "5"),
  `generate_audio` (keep false to save cost), `negative_prompt`, `cfg_scale`, `end_image_url`, `elements` (character
  refs as `@Element1`).
- Output: `video.url`.
- Price: ~$0.084/s without audio and $0.126/s with audio [A], so a 5 s clip is ~$0.42. Latency: ~1-3 min (UNVERIFIED).

Budget option: `fal-ai/kling-video/v2.5-turbo/standard/image-to-video` costs $0.21 per 5 s, plus $0.042 per extra
second [P]. Turbo v3: `fal-ai/kling-video/v3/turbo/standard/image-to-video` ($0.112/s, `image_url` input [P]).
Others [T]: `bytedance/seedance-2.0/fast|mini/image-to-video` (Mini ~$0.036/s at 480p [A]),
`wan/v2.6/image-to-video/flash`, and `fal-ai/ltx-2.3/image-to-video/fast`. Veo is not in the client type map, so check
its fal ID separately (UNVERIFIED).

**Replicate default:** `kwaivgi/kling-v2.5-turbo-pro`. Inputs: `prompt`, `start_image`, `duration` (5 | 10),
`aspect_ratio` (UNVERIFIED names). Output: a URL. Price: ~$0.07/s, so $0.35 per 5 s [A]. Newer option:
`kwaivgi/kling-v3-video` (`start_image`, `end_image`, `duration` 3-15, `mode` "standard" (720p) | "pro" (1080p)
[A]; ~$0.168/s [A]).

### B.8 Talking video from a script (TTS, then avatar lip-sync)

The pipeline is: script → LLM cleanup (optional) → TTS audio → avatar video from the user's best portrait plus the
audio.

| Step | fal default | Replicate default |
|---|---|---|
| TTS | `fal-ai/minimax/speech-2.8-turbo` [T]: `prompt` (text; pause with `<#0.5#>`, tags like `(laughs)`), `voice_setting: { voice_id, speed, pitch, emotion }`, `language_boost`, `output_format: "url"`; output `audio.url`, `duration_ms`; $0.06 per 1k chars [P]; ~1-3 s | `minimax/speech-2.6-turbo`: `text`, `voice_id` (UNVERIFIED names); output URL; $0.06 per 1k input tokens (about chars) [P] |
| Avatar | `fal-ai/kling-video/ai-avatar/v2/standard` [T]: `image_url`, `audio_url`, `prompt`; output `video.url`, `duration`; $0.0562 per output second [P] | `bytedance/omni-human-1.5`: `image`, `audio`, `prompt`; price UNVERIFIED (~$0.14-0.16/s [A]). Alternative: `kwaivgi/kling-avatar-v2` |

Higher quality on fal: `fal-ai/bytedance/omnihuman/v1.5` [T] (`image_url`, `audio_url`, `resolution` "720p" |
"1080p", `turbo_mode`, `mask_url` to pick a speaker; audio up to 30 s at 1080p or 60 s at 720p; ~$0.16/s [A]). The
pro tier `fal-ai/kling-video/ai-avatar/v2/pro` costs $0.115/s [P]. Premium TTS: `elevenlabs/tts/eleven-v4` [T]
(`text`, `voice`, `stability`; output `audio.url`; price UNVERIFIED) or `fal-ai/elevenlabs/tts/turbo-v2.5` ($0.05 per
1k chars [P]). One-call script-to-video: `veed/fabric-1.0/text` [T] (`image_url`, `text`, `resolution` "480p" |
"720p", `voice_description`; ~$0.08/s at 480p and $0.15/s at 720p [A], dated). To re-sync an existing video, use
`fal-ai/sync-lipsync/v3` [T] (price UNVERIFIED).

### B.9 Virtual try-on

**fal default:** `fal-ai/fashn/tryon/v1.6` [T]. Inputs: `model_image` (URL of the user's photo), `garment_image`,
`category` ("auto" | "tops" | "bottoms" | "one-pieces"), `garment_photo_type` ("auto" | "model" | "flat-lay"), `mode`
("performance" | "balanced" | "quality"), `num_samples`, `seed`, `moderation_level`, `segmentation_free`. Output:
`images[0].url`. Price: $0.075 per generation [P]. Output resolution: 864x1296 [A]. Latency: ~5-15 s (UNVERIFIED).
Alternatives: `google/virtual-try-on`, `bria/fibo-edit-1.5/virtual-try-on`, `fal-ai/image-apps-v2/virtual-try-on`
[T]. Nano Banana 2 edit with the person image plus the garment image also works.

**Replicate default:** use `google/nano-banana-2` with `image_input: [personUrl, garmentUrl]` and an instruction
prompt. `cuuupid/idm-vton` (~$0.024/run [P]) is **CC BY-NC-SA, non-commercial only**: do not use it in the SaaS. No
FASHN model was found on Replicate.

### B.10 LLM prompt helper

**fal default:** `openrouter/router` [T] (`fal-ai/any-llm` is deprecated). Inputs: `model` (required, an OpenRouter
slug), `prompt`, `system_prompt`, `temperature`, `max_tokens`, `reasoning`. Output: `output` (string), plus `usage`
and `error`. Recommended model: `google/gemini-3.1-flash-lite` ($0.25 / $1.50 per 1M tokens on OpenRouter [P]; any fal
markup UNVERIFIED), so a ~600-token call costs about $0.0005. Use it with `fal.run(...)` (synchronous, ~1 s). There is
an OpenAI-compatible route: base URL `https://fal.run/openrouter/router/openai/v1` [A]. For image captions (Klein
datasets), use `openrouter/router/vision` [T].

```ts
const { data } = await fal.run("openrouter/router", { input: {
  model: "google/gemini-3.1-flash-lite",
  system_prompt: "Rewrite the user's request as one photographic prompt. Keep the token ohwx and the subject class. " +
                 "Describe framing, lens, lighting, wardrobe, setting. No names of real people. Max 80 words.",
  prompt: userText, temperature: 0.4, max_tokens: 300,
}});
const prompt = data.output.trim();
```

**Replicate default:** `openai/gpt-5-mini` (official; ~$0.25 / $2.00 per 1M tokens [A]). Inputs: `prompt`,
`system_prompt`, `reasoning_effort`, `max_completion_tokens` (UNVERIFIED names). Output: `string[]` chunks, so call
`.join("")`.

### B.11 NSFW classification, face analysis, and built-in safety flags

**fal default:** `fal-ai/x-ailab/nsfw` [T]. Input: `image_urls` (up to 10 per call). Output: `has_nsfw_concepts:
boolean[]`. Price: $0.001/image [P]. The alternative `fal-ai/imageutils/nsfw` [T] takes `image_url` and returns
`nsfw_probability: number` (price UNVERIFIED). For face analysis, there is no dedicated hosted face-embedding endpoint
in the fal type map. Use the local stack (C), or `fal-ai/moondream3-preview/detect` / `fal-ai/florence-2-large/
object-detection` for counting faces.

**Replicate default:** `falcons-ai/nsfw_image_detection` with version
`97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d` [A]. Input: `image`. Output: `"normal" | "nsfw"`.
Price: UNVERIFIED (fractions of a cent).

Safety controls on the generation endpoints [T]:

- `fal-ai/flux-lora`, `fal-ai/flux-lora/inpainting`, `fal-ai/flux-2/lora` and the FLUX 3 Klein LoRA endpoints take
  `enable_safety_checker` (default true). **Disabling it requires account authorization**: unauthorized requests are
  always checked, and flagged images come back black. They return `has_nsfw_concepts: boolean[]`.
- Partner models use `safety_tolerance` instead: Nano Banana takes "1" (strictest) to "6", default "4". FLUX 3 and
  Kontext take 0-4 or "1"-"6". Kling, FASHN, MiniMax and SeedVR take `enable_safety_checker`.
- On Replicate, BFL models take `disable_safety_checker` (dev) or `safety_tolerance` (pro) (UNVERIFIED per model).

Policy: keep provider checkers **on**. Additionally, block any output where `has_nsfw_concepts[i]` is true or
x-ailab flags it, before showing it to the user.

---

## C. Local safety stack (no API key)

### C.1 `@vladmandic/human@3.3.6`: face count, embedding, similarity, age [R]

- Versions: human 3.3.6 (2025-08-26) on tfjs 4.22.0 (2024-10-21). Both are in maintenance mode, so pin exact
  versions.
- Install: `pnpm add @vladmandic/human@3.3.6 @tensorflow/tfjs-core@4.22.0 @tensorflow/tfjs-converter@4.22.0
  @tensorflow/tfjs-backend-wasm@4.22.0` (`sharp` is already a dependency).
- Use the **`human.node-wasm.js`** build. It needs core + converter + backend-wasm and **not** `@tensorflow/tfjs-node`.
- Measured runtime footprint: `human.node-wasm.js` 0.3 MB; tf-core 1.2 MB; tf-converter 1.2 MB; wasm binaries
  0.3-0.4 MB each; models used: `blazeface` 0.6 MB + `facemesh` 1.5 MB + `faceres` 7.0 MB. sharp with libvips adds
  ~19 MB. Total traced size: about 35 MB. The npm install is 162 MB because packages ship sources and all models.
- **Vercel: viable** on the Node runtime with 1 GB or more of memory. That is well under the 250 MB unzipped function
  limit (limit from Vercel docs, not re-checked).
- `@tensorflow/tfjs-node` downloads a native libtensorflow at install time and is not recommended for serverless.

Two gotchas, both found in testing:

1. Human's `package.json` `exports` keys lack `./`, so `@vladmandic/human/dist/human.node-wasm.js` throws
   `ERR_PACKAGE_PATH_NOT_EXPORTED`. Resolve the main entry and load the file by absolute path.
2. The wasm build loads models with `fetch()`, and Node's `fetch` cannot read `file://` URLs. Shim it as shown below.

```ts
// src/lib/safety/faces.ts  (Node runtime; server-only)
import "server-only";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {                 // allow file:// model loading
  const url = typeof input === "string" ? input : input.url ?? String(input);
  return url.startsWith("file://") ? new Response(await readFile(fileURLToPath(url))) : realFetch(input, init);
}) as typeof fetch;

const humanDist = path.dirname(require.resolve("@vladmandic/human"));   // .../human/dist
const { Human } = require(path.join(humanDist, "human.node-wasm.js"));
const wasmDir = path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm")) + "/";

const human = new Human({
  backend: "wasm", wasmPath: wasmDir, debug: false, cacheModels: false,
  modelBasePath: "file://" + path.join(path.dirname(humanDist), "models") + "/",
  face: { enabled: true, detector: { rotation: false, maxDetected: 10, minConfidence: 0.3 },
          mesh: { enabled: true }, description: { enabled: true },      // faceres: age, gender, 1024-d embedding
          iris: { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false },
  gesture: { enabled: false }, segmentation: { enabled: false },
});
const ready = human.load();                                            // ~0.1 s from disk [R]

export async function analyzeFaces(bytes: Buffer) {
  await ready;
  const { data, info } = await sharp(bytes).rotate().removeAlpha().resize({ width: 1280, withoutEnlargement: true })
    .raw().toBuffer({ resolveWithObject: true });
  const t = human.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
  const res = await human.detect(t);
  human.tf.dispose(t);
  return res.face.map((f: any) => ({ score: f.score, box: f.box, age: f.age as number, embedding: f.embedding as number[] }));
}
export const sameness = (a: number[], b: number[]) => human.match.similarity(a, b); // 0..1; >0.5 = same person (Human docs)
export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return d / Math.sqrt(na * nb);
}
```

Measured in this sandbox (CPU, wasm backend): about 150 ms for a 1-face image and about 570 ms for a 1280 px image on
the first call. Embeddings are 1024-d.

Thresholds:

- `human.match.similarity` (Euclidean, multiplier 20) is documented as "above 0.5 can be considered a match". The faceid
  demo uses 0.5. Two different people in the bundled samples scored 0.26 on similarity and 0.30 on raw cosine.
- No raw-cosine threshold for faceres is published (UNVERIFIED). Calibrate on 50 or more labelled pairs before
  launch. Starting points: `similarity >= 0.5`, or cosine around 0.5-0.6.

How OpenShoot uses it:

- **Upload gate:** exactly one face per selfie, `score > 0.8`.
- **Same-person check:** pairwise similarity of each selfie against the set median. Drop outliers below 0.5. Block
  the upload if fewer than 10 selfies remain.
- **Age:** if any face has `age < 25`, route to manual review or ID verification. Human's age estimate is coarse (error
  unknown, UNVERIFIED) and is **not** legal age verification.
- **Output gate:** the generated face should match the user's centroid embedding. This catches accidental
  other-person outputs and multi-person edits that used an unconsented face.

### C.2 `nsfwjs@4.4.0` (2026-08-04) [R]

- Ships 3 bundled models: MobileNetV2 (3.5 MB, ~90% accuracy), MobileNetV2Mid (5.7 MB, ~93%), and InceptionV3
  (29 MB). Import the subpaths so only one model is bundled.
- Peer dependency: `@tensorflow/tfjs`. npm auto-installs the 147 MB umbrella package, but only the used files are
  traced. `engines.node` pins "22.13.0" exactly, so other Node 22 versions get a harmless EBADENGINE warning.
- Measured with the pure-JS CPU backend: load 1.3 s, ~1.1 s per image. The wasm backend should be faster (not
  measured).

```ts
import * as tf from "@tensorflow/tfjs";
import { load } from "nsfwjs/core";
import { MobileNetV2Model } from "nsfwjs/models/mobilenet_v2";
import sharp from "sharp";
await tf.setBackend("cpu"); await tf.ready();   // or "wasm" after importing @tensorflow/tfjs-backend-wasm + setWasmPaths
const model = await load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
export async function nsfwScores(bytes: Buffer) {
  const { data, info } = await sharp(bytes).removeAlpha().resize(224, 224, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const img = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
  const preds = await model.classify(img); img.dispose();       // [{ className: "Neutral"|"Drawing"|"Sexy"|"Porn"|"Hentai", probability }]
  const p = Object.fromEntries(preds.map((x) => [x.className, x.probability]));
  return { porn: p.Porn + p.Hentai, sexy: p.Sexy, block: p.Porn + p.Hentai > 0.5 || p.Sexy > 0.85 };
}
```

Recommended order: nsfwjs runs locally on uploads (free). Generated outputs go through the provider's checker plus
`fal-ai/x-ailab/nsfw` ($0.001).

### C.3 Optional hosted alternatives

**AWS Rekognition** (`@aws-sdk/client-rekognition@3.1176.0`) [T]. Price: ~$0.001/image for the first 1M images per
month (UNVERIFIED).

```ts
import { RekognitionClient, CompareFacesCommand, DetectFacesCommand, RecognizeCelebritiesCommand,
         DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
const rk = new RekognitionClient({ region: process.env.AWS_REGION });
const cmp = await rk.send(new CompareFacesCommand({ SourceImage: { Bytes: selfie }, TargetImage: { Bytes: output }, SimilarityThreshold: 80 }));
cmp.FaceMatches?.[0]?.Similarity;                                   // 0-100; UnmatchedFaces lists the rest
const det = await rk.send(new DetectFacesCommand({ Image: { Bytes: img }, Attributes: ["AGE_RANGE"] }));
det.FaceDetails?.map((f) => f.AgeRange);                            // { Low, High }; FaceDetails.length = face count
const cel = await rk.send(new RecognizeCelebritiesCommand({ Image: { Bytes: img } }));
cel.CelebrityFaces?.map((c) => [c.Name, c.MatchConfidence]);        // block training on celebrity selfies
const mod = await rk.send(new DetectModerationLabelsCommand({ Image: { Bytes: img }, MinConfidence: 60 }));
```

Images are limited to 5 MB as bytes (15 MB from S3). Supported formats are JPEG and PNG.

**OpenAI omni-moderation** (`openai@7.63.0`) [T]. Free. Handles text and images in one call.

```ts
import OpenAI from "openai";
const r = await new OpenAI().moderations.create({
  model: "omni-moderation-latest",
  input: [{ type: "text", text: userPrompt }, { type: "image_url", image_url: { url: imageUrlOrDataUrl } }],
});
r.results[0].flagged; r.results[0].categories["sexual/minors"]; r.results[0].category_scores.sexual;
// category_applied_input_types tells which categories were evaluated on the image vs the text
```

The SDK types also list `omni-moderation-csam-latest`, which returns `likely-csam` and `likely-csam/gen-ai` scores.
Its access requirements are UNVERIFIED; apply to OpenAI if you need it.

---

## D. `src/config/models.ts` (ready to paste)

```ts
// src/config/models.ts — snapshot 2026-11-24. costUsd = estimated provider cost per call at default settings.
export type Capability =
  | "train" | "generate" | "draft" | "editMulti" | "inpaint" | "upscale" | "faceRestore" | "removeBg"
  | "imageToVideo" | "tts" | "talkingVideo" | "tryOn" | "llm" | "nsfw";

export interface ModelSpec {
  id: string;            // fal endpoint id, or Replicate "owner/name"
  version?: string;      // Replicate community models only; "latest" = resolve via models.get() at runtime
  costUsd: number;       // estimate per call (see `unit`)
  unit: string;
  notes: string;
  alt?: string[];
}

export const MODELS = {
  fal: {
    train: { id: "fal-ai/flux-lora-fast-training", costUsd: 2.0, unit: "run @1000 steps (linear)",
      notes: "images_data_url=zip, trigger_word, steps 1000-1500, create_masks=true -> diffusers_lora_file.url",
      alt: ["blackforestlabs/flux-3/klein/base/trainer", "fal-ai/flux-lora-portrait-trainer", "fal-ai/qwen-image-2512-trainer-v2"] },
    generate: { id: "fal-ai/flux-lora", costUsd: 0.035, unit: "image <=1MP (billed per MP, rounded up)",
      notes: "loras:[{path,scale}], 28 steps, guidance 3.5 -> images[0].url, has_nsfw_concepts[0]",
      alt: ["blackforestlabs/flux-3/klein/text-to-image/lora"] },
    draft: { id: "fal-ai/flux-lora", costUsd: 0.035, unit: "image 512x640",
      notes: "num_inference_steps 8-12, acceleration 'regular'; faster not cheaper. Klein draft ~$0.004",
      alt: ["fal-ai/flux-lora/stream", "blackforestlabs/flux-3/klein/text-to-image/lora"] },
    editMulti: { id: "fal-ai/nano-banana-2/edit", costUsd: 0.08, unit: "image @1K",
      notes: "image_urls (<=14), resolution 0.5K/1K/2K/4K, safety_tolerance '1'-'6' -> images[0].url",
      alt: ["google/nano-banana-2.1/edit", "bytedance/seedream/v5/pro/edit", "blackforestlabs/flux-3/klein/edit-image/lora"] },
    inpaint: { id: "fal-ai/flux-lora/inpainting", costUsd: 0.035, unit: "image <=1MP",
      notes: "image_url, mask_url (white=repaint), loras = user LoRA, strength 0.85", alt: ["fal-ai/flux-pro/v1/fill"] },
    upscale: { id: "clarityai/crystal-upscaler", costUsd: 0.064, unit: "2x of 1MP (=4MP out @ $0.016/MP)",
      notes: "portrait-tuned; scale_factor, creativity -> images[0].url", alt: ["fal-ai/seedvr/upscale/image"] },
    faceRestore: { id: "fal-ai/codeformer", costUsd: 0.005, unit: "image ($0.0021/MP)",
      notes: "fidelity >=0.7 to preserve identity -> image.url", alt: ["fal-ai/image-editing/face-enhancement"] },
    removeBg: { id: "fal-ai/birefnet/v2", costUsd: 0.002, unit: "image (compute-second billing, UNVERIFIED)",
      notes: "model 'Portrait' -> image.url", alt: ["fal-ai/bria/background/remove"] },
    imageToVideo: { id: "fal-ai/kling-video/v3/standard/image-to-video", costUsd: 0.42, unit: "5s clip, audio off",
      notes: "start_image_url, duration '5', generate_audio false -> video.url",
      alt: ["fal-ai/kling-video/v2.5-turbo/standard/image-to-video", "bytedance/seedance-2.0/fast/image-to-video"] },
    tts: { id: "fal-ai/minimax/speech-2.8-turbo", costUsd: 0.03, unit: "500-char script ($0.06/1k chars)",
      notes: "prompt, voice_setting.voice_id, output_format 'url' -> audio.url", alt: ["elevenlabs/tts/eleven-v4"] },
    talkingVideo: { id: "fal-ai/kling-video/ai-avatar/v2/standard", costUsd: 1.69, unit: "30s video ($0.0562/s)",
      notes: "image_url + audio_url -> video.url (alias: lipsync)",
      alt: ["fal-ai/bytedance/omnihuman/v1.5", "veed/fabric-1.0/text", "fal-ai/sync-lipsync/v3"] },
    tryOn: { id: "fal-ai/fashn/tryon/v1.6", costUsd: 0.075, unit: "generation",
      notes: "model_image, garment_image, category 'auto', mode 'balanced' -> images[0].url", alt: ["google/virtual-try-on"] },
    llm: { id: "openrouter/router", costUsd: 0.0005, unit: "prompt-helper call (~600 tokens)",
      notes: "input.model = 'google/gemini-3.1-flash-lite'; fal.run; output = data.output", alt: ["openrouter/router/vision"] },
    nsfw: { id: "fal-ai/x-ailab/nsfw", costUsd: 0.001, unit: "image",
      notes: "image_urls (<=10) -> has_nsfw_concepts[]", alt: ["fal-ai/imageutils/nsfw"] },
  },
  replicate: {
    train: { id: "replicate/fast-flux-trainer", version: "latest", costUsd: 1.5, unit: "run (~2 min on 8xH200)",
      notes: "trainings.create(..., {destination, input:{input_images, trigger_word, lora_type:'subject'}}) -> output.weights/version",
      alt: ["ostris/flux-dev-lora-trainer"] },
    generate: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.032, unit: "image",
      notes: "lora_weights = training.output.weights; output string[]" },
    draft: { id: "black-forest-labs/flux-dev-lora", costUsd: 0.032, unit: "image",
      notes: "num_inference_steps 8, megapixels '0.25', go_fast true (cost reduction UNVERIFIED)",
      alt: ["black-forest-labs/flux-schnell-lora"] },
    editMulti: { id: "google/nano-banana-2", costUsd: 0.08, unit: "image @1K (UNVERIFIED)",
      notes: "image_input (<=14) -> URL", alt: ["bytedance/seedream-5-pro", "google/nano-banana-pro"] },
    inpaint: { id: "black-forest-labs/flux-fill-pro", costUsd: 0.05, unit: "image",
      notes: "image + mask; identity-aware: trained destination model with image+mask" },
    upscale: { id: "topazlabs/image-upscale", costUsd: 0.05, unit: "unit (UNVERIFIED)",
      notes: "face enhancement option", alt: ["philz1337x/crystal-upscaler", "recraft-ai/recraft-crisp-upscale"] },
    faceRestore: { id: "sczhou/codeformer", version: "latest", costUsd: 0.005, unit: "image (GPU-seconds, UNVERIFIED)",
      notes: "codeformer_fidelity >=0.7 (param name UNVERIFIED)", alt: ["tencentarc/gfpgan"] },
    removeBg: { id: "men1scus/birefnet", version: "f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
      costUsd: 0.002, unit: "image (GPU-seconds, UNVERIFIED)", notes: "image -> URL" },
    imageToVideo: { id: "kwaivgi/kling-v2.5-turbo-pro", costUsd: 0.35, unit: "5s clip ($0.07/s)",
      notes: "start_image, duration 5|10 -> URL", alt: ["kwaivgi/kling-v3-video"] },
    tts: { id: "minimax/speech-2.6-turbo", costUsd: 0.03, unit: "500-char script ($0.06/1k)", notes: "text, voice_id -> URL" },
    talkingVideo: { id: "bytedance/omni-human-1.5", costUsd: 4.8, unit: "30s video (~$0.16/s, UNVERIFIED)",
      notes: "image + audio -> URL", alt: ["kwaivgi/kling-avatar-v2"] },
    tryOn: { id: "google/nano-banana-2", costUsd: 0.08, unit: "image",
      notes: "image_input [person, garment] + instruction. cuuupid/idm-vton is NON-COMMERCIAL: do not use" },
    llm: { id: "openai/gpt-5-mini", costUsd: 0.001, unit: "prompt-helper call",
      notes: "prompt, system_prompt; output string[] -> join('')" },
    nsfw: { id: "falcons-ai/nsfw_image_detection", version: "97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d",
      costUsd: 0.0005, unit: "image (UNVERIFIED)", notes: "image -> 'normal' | 'nsfw'" },
  },
} as const satisfies Record<"fal" | "replicate", Record<Capability, ModelSpec>>;
```

---

## E. Cost table (provider cost only, estimates)

| Action | fal default | fal Klein track | Replicate default |
|---|---|---|---|
| 1 identity training (1000 steps) | $2.00 | $4.30 | ~$1.50 |
| 1 final photo (≤1 MP) | $0.035 | $0.012 | $0.032 |
| 1 draft preview | ~$0.035 (faster, same price) | ~$0.004 | ~$0.032 |
| 1 multi-reference edit (1K) | $0.08 | ~$0.03 (Klein edit + LoRA, UNVERIFIED) | ~$0.08 (or $0.045 with Seedream 5 Pro) |
| 1 inpaint | $0.035 | n/a | $0.05 |
| 1 upscale 2x (portrait) | $0.064 | $0.064 | ~$0.05 |
| 1 face restore | ~$0.005 | ~$0.005 | ~$0.005 |
| 1 background removal | ~$0.002 | ~$0.002 | ~$0.002 |
| 1 video, 5 s | $0.42 (Kling v3 std) / $0.21 (v2.5 turbo std) | same | ~$0.35 |
| 1 talking video, 30 s (TTS + avatar) | $0.03 + $1.69 = **$1.72** | same | $0.03 + ~$4.80 |
| 1 try-on | $0.075 | $0.075 | ~$0.08 |
| 1 prompt-helper call | ~$0.0005 | ~$0.0005 | ~$0.001 |
| 1 hosted NSFW check | $0.001 | $0.001 | ~$0.0005 |
| Local checks (human + nsfwjs) | $0 (CPU time only) | $0 | $0 |

**Bundle "1 training + 100 photos":**

| | fal default | fal Klein track | Replicate default |
|---|---|---|---|
| Training | $2.00 | $4.30 | $1.50 |
| 100 finals | $3.50 | $1.20 | $3.20 |
| **Core subtotal** | **$5.50** | **$5.50** | **$4.70** |
| + 100 drafts | +$3.50 | +$0.40 | +$3.20 |
| + 100 NSFW checks + 100 prompt-helper calls | +$0.15 | +$0.15 | +$0.15 |
| + upscale 20 favourites | +$1.28 | +$1.28 | +$1.00 |
| **Realistic total** | **~$10.40** | **~$7.30** | **~$9.10** |

Pricing levers: keep fal FLUX.1 outputs at or under 1024x1024-equivalent pixels (one pixel over 1 MP may bill as
2 MP, UNVERIFIED). Drafts are where the Klein track saves money, so adopt it if the likeness A/B passes. Leave Kling
`generate_audio` off. Cache Replicate `latest_version` lookups and validate inputs against `openapi_schema` at deploy.
