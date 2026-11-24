# Self-hosting OpenShoot

This guide takes OpenShoot from a local demo to a live service. There are two supported paths:

- **[Vercel](#deploy-on-vercel)**: serverless, managed Postgres (Neon or Supabase) and Cloudflare R2. Least to
  operate.
- **[Docker](#deploy-with-docker)**: one server running Postgres, MinIO, the web app and a job worker with Docker
  Compose. Full control, fixed cost.

Both run the same code. Every variable mentioned here is documented in [`.env.example`](../.env.example) and validated
at startup by [`src/lib/env.ts`](../src/lib/env.ts). Run `pnpm check-env` (or `NODE_ENV=production pnpm check-env`
to see the production warnings) whenever you change configuration.

## What a live deployment needs

| Piece | Recommended | Variables |
|---|---|---|
| Public HTTPS URL | your domain | `NEXT_PUBLIC_APP_URL` (build time and runtime) |
| Session secret | `openssl rand -base64 32` | `BETTER_AUTH_SECRET` |
| Postgres 14+ (16 recommended) | Neon, Supabase, or the Compose `db` service | `DATABASE_URL`, `DATABASE_POOL_MAX` |
| Object storage | Cloudflare R2 (or S3, B2, MinIO) | `STORAGE_DRIVER=s3`, `S3_*` |
| AI provider | fal (default) or Replicate | `FAL_KEY` or `AI_PROVIDER=replicate` + `REPLICATE_*` |
| Payments | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Email | Resend with a verified domain | `RESEND_API_KEY`, `EMAIL_FROM` |
| Background work | Vercel Cron, or the Compose `worker` service | `CRON_SECRET` (Vercel) |
| Safety | built-in local models (no keys) | `FACE_PROVIDER`, `MODERATION_PROVIDER` (optional) |
| Google sign-in (optional) | Google Cloud OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Legal pages | your company details | `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_TAKEDOWN_EMAIL`, `NEXT_PUBLIC_LEGAL_JURISDICTION` |

Rules enforced at startup in production (`NODE_ENV=production`, which both Vercel and the Docker image use):

- `BETTER_AUTH_SECRET` must be at least 32 characters, have some variety, and not be a published placeholder.
- A real AI provider requires real payments **and** real email. Mock checkout would hand out free credits spent on
  your AI account, and the public dev mailbox would expose sign-in links. An all-mock deployment (a demo) is allowed
  and shows a "Demo mode" banner.
- A real AI provider requires real safety providers: `FACE_PROVIDER` and `MODERATION_PROVIDER` can't be `mock`
  (they default to `local`, which needs no keys).
- Each selected provider needs its keys (for example `AI_PROVIDER=replicate` needs `REPLICATE_API_TOKEN` and
  `REPLICATE_OWNER`).

`MOCK_PROVIDERS=true` in `.env.example` is for local use. Set it to `false` (or remove it) for a live deployment.

---

## Deploy on Vercel

### 1. Database: Neon or Supabase

Create a Postgres database and copy two connection strings: a **pooled** one for the app and a **direct** (or
session) one for migrations.

- **Neon:** the pooled string has `-pooler` in the host name; the direct one doesn't.
- **Supabase:** the transaction pooler is `…pooler.supabase.com:6543`; for migrations use the session pooler
  (port 5432) or the direct connection (`db.<ref>.supabase.co:5432`, IPv6 unless you have the IPv4 add-on).

How the app treats pooled URLs (`src/db/index.ts`): when `DATABASE_URL` contains `pooler`, `pgbouncer` or `:6543`,
prepared statements are turned off, because transaction poolers don't support them. Set `DATABASE_POOL_MAX` to 1–3
on Vercel: every function instance opens its own pool (default 10 connections). The migration script
(`pnpm db:migrate`) also detects these URLs; with a pooler it skips the advisory lock that normally keeps two
deployments from migrating at the same time, which is why a direct URL is better for migrations.

Apply the migrations from your machine (Vercel's build doesn't run them):

```bash
DATABASE_URL="postgres://…direct…" pnpm db:migrate
```

### 2. Storage: Cloudflare R2

Vercel's file system is read-only and ephemeral, so use `STORAGE_DRIVER=s3`.

1. Cloudflare dashboard → R2 → create a bucket. Keep it **private** (no public access, no custom public domain
   needed).
2. R2 → Manage R2 API Tokens → create a token with **Object Read & Write** on that bucket.
3. Set:

   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=<bucket>
   S3_ACCESS_KEY_ID=<token access key id>
   S3_SECRET_ACCESS_KEY=<token secret>
   ```

No CORS rules are needed: uploads go through the API as multipart POSTs (photos are resized to ≤ 2048 px in the
browser first, which keeps them under Vercel's 4.5 MB request limit), zip downloads are streamed by the server, and
browsers only load short-lived signed GET URLs in `<img>` / `<video>` tags and download links. With a public
endpoint (R2, S3), AI providers download their inputs (training zips, photos, masks) from the same signed URLs, so
it must be reachable from the public internet. An endpoint on `localhost`, a private IP, a `.local` / `.internal`
name or a bare service name (`isPrivateEndpoint` in `src/providers/storage/s3.ts`) is treated as private: inputs are
then uploaded to the AI provider's own file storage instead (see the
[Docker storage section](#storage-on-a-remote-server)).

AWS S3 works the same way: leave `S3_ENDPOINT` empty and set `S3_REGION` to the bucket's region.

### 3. AI provider: fal

Create a key at <https://fal.ai/dashboard/keys> and set `FAL_KEY`. `AI_PROVIDER` defaults to `fal` when
`MOCK_PROVIDERS` is off. fal webhooks are verified with fal's public keys, so there is no webhook secret to set.
To use Replicate instead, see [Choosing fal or Replicate](#choosing-fal-or-replicate).

### 4. Payments: Stripe

1. Copy the secret key (`sk_live_…`, or `sk_test_…` while testing) from <https://dashboard.stripe.com/apikeys> into
   `STRIPE_SECRET_KEY`. `PAYMENT_PROVIDER` defaults to `stripe` when `MOCK_PROVIDERS` is off.
2. Add a webhook endpoint at <https://dashboard.stripe.com/webhooks>:
   - URL: `https://<your-domain>/api/webhooks/payments/stripe` (`WEBHOOK_BASE_URL` if you set one, otherwise
     `NEXT_PUBLIC_APP_URL`)
   - Events:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`,
     `charge.dispute.closed` (`charge.dispute.funds_withdrawn` is optional). The list is `STRIPE_WEBHOOK_EVENTS` in
     `src/providers/payment/stripe.ts`.
   - Copy its signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. Each endpoint (and each `stripe listen`
     session) has its own secret.
3. Configure the Customer Portal (Settings → Billing → Customer portal) and save it once in test mode and once in
   live mode; the "Manage billing" button on `/app/billing` opens it. Plan changes go through the app's own
   checkout, so turn off "customers can switch plans" (and pausing) in the portal.
4. Prices come from [`src/config/plans.ts`](../src/config/plans.ts) as inline `price_data`; you don't need to create
   products. To use existing Stripe prices instead, set the optional `STRIPE_PRICE_<PLAN>_<MONTH|YEAR>` and
   `STRIPE_PRICE_CREDITS_<100|500|1500>` variables (see `.env.example`).
5. The promotion-code box at checkout is off by default, because Stripe accepts every active promotion code in the
   account there (including ones made for other products). Restrict your codes, then set
   `STRIPE_ALLOW_PROMOTION_CODES=true` to show it.

What the app does with these events: paid checkouts and invoices grant credits once each; zero-total invoices
(trials, 100% coupons) start the plan without credits; refunds reverse a proportional share of the credits, and a
full refund of a subscription invoice ends that subscription (refund partially to keep it); a dispute (chargeback)
reverses every credit the payment granted, ends its subscription and flags the account in the admin moderation
queue; a dispute you win restores the credits but not the subscription. A negative balance blocks all jobs until it
is settled. Remaining edge cases are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md#payments--credits).

Test locally first with the Stripe CLI:
`stripe listen --forward-to localhost:3000/api/webhooks/payments/stripe` (use the secret it prints).

### 5. Email: Resend

1. Add and verify your sending domain at <https://resend.com/domains> (add the DNS records Resend shows; a DMARC
   record helps deliverability).
2. Create an API key at <https://resend.com/api-keys> and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain, e.g. `EMAIL_FROM="OpenShoot <hello@photos.example.com>"`.
   The default (`hello@localhost`) is rejected by Resend.

Magic links are the main sign-in method, so email must work before you invite users. `EMAIL_PROVIDER` defaults to
`resend` when `RESEND_API_KEY` is set and `MOCK_PROVIDERS` is off.

### 6. Google sign-in (optional)

Create an OAuth client of type "Web application" at <https://console.cloud.google.com/apis/credentials> with the
authorized redirect URI `https://<your-domain>/api/auth/callback/google`, and set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. The Google button appears only when both are set.

### 7. Cron jobs and `CRON_SECRET`

[`vercel.json`](../vercel.json) schedules two crons:

| Path | Schedule | Does |
|---|---|---|
| `/api/cron/jobs` | every minute | syncs running jobs whose webhook was missed, fails and refunds stuck jobs |
| `/api/cron/maintenance` | daily, 04:00 UTC | low-credit emails, expires invites and deletion links, resumes stalled account deletions, deletes demo accounts older than 24 hours and job-input uploads (references, garments, masks) older than 30 days, prunes rate-limit rows and email-outbox rows older than 90 days |

Generate a secret with `openssl rand -hex 32` and set it as `CRON_SECRET`; Vercel sends it as
`Authorization: Bearer <CRON_SECRET>` automatically. Without it both endpoints refuse every call.

**Hobby plan:** cron jobs may run at most once a day, and a deployment with the every-minute schedule is rejected.
Before deploying, change the `/api/cron/jobs` schedule in your copy of `vercel.json` to a daily one (e.g.
`"0 0 * * *"`). Jobs still complete promptly: providers call the webhook, and `GET /api/jobs/:id` (which the UI
polls) also checks a running job with its provider (at most every 20 seconds per job, 60 for training, while
webhooks are enabled). The cron is only the safety net.
Vercel's Hobby plan is also limited to non-commercial use; use Pro for a paid service.

### 8. Function memory

The local safety models (face analysis and the NSFW classifier) load in-process and use about 450 MB once loaded
([SAFETY_PROVIDERS.md §5–6](SAFETY_PROVIDERS.md#5-performance-and-memory-measured)). Give functions **at least
1024 MB** (Project → Settings → Functions); don't lower the default below that. The first request on a cold
instance also pays roughly 0.5 s to initialize the models. The model files are traced into the deployment by
`next.config.ts` (about 19 MB, plus sharp).

### 9. Environment variables

Set these in Project → Settings → Environment Variables (the Deploy button asks for most of them):

```
NEXT_PUBLIC_APP_URL=https://photos.example.com
BETTER_AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=<pooled connection string>
DATABASE_POOL_MAX=2
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=…
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
FAL_KEY=…
STRIPE_SECRET_KEY=…
STRIPE_WEBHOOK_SECRET=…
RESEND_API_KEY=…
EMAIL_FROM="OpenShoot <hello@photos.example.com>"
CRON_SECRET=<openssl rand -hex 32>
ADMIN_EMAILS=you@example.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@photos.example.com
NEXT_PUBLIC_TAKEDOWN_EMAIL=takedown@photos.example.com
NEXT_PUBLIC_LEGAL_ENTITY=Example Photo Ltd
```

`NEXT_PUBLIC_*` values are inlined at build time: redeploy after changing them. `TRUSTED_PROXY_HOPS` defaults to 1 on
Vercel (detected through the `VERCEL` variable), which is right. Leave `WEBHOOK_BASE_URL` empty unless providers
must call a different host.

### 10. Deploy, migrate, become admin

1. Deploy (the button in the README, or import the repo in Vercel; `vercel.json` sets the install command and
   crons).
2. Run `pnpm db:migrate` against the direct database URL (step 1), if you haven't yet.
3. Make yourself admin: either list your email in `ADMIN_EMAILS` (promoted at your next sign-in), or run
   `DATABASE_URL="…" SEED_ADMIN_EMAIL=you@example.com pnpm db:seed` from your machine.
4. Sign in, buy the smallest credit pack in Stripe test mode, train a model and generate a photo. Check
   `/admin` → jobs for failures and provider cost.

---

## Deploy with Docker

### Services and volumes

[`docker-compose.yml`](../docker-compose.yml) runs everything from one image ([`Dockerfile`](../Dockerfile)):

| Service | What | Exposed |
|---|---|---|
| `db` | Postgres 16 (`postgres:16-alpine`) | not published |
| `minio` | S3-compatible storage (`pgsty/minio`, a maintained MinIO build) | `127.0.0.1:9000` (S3 API), `127.0.0.1:9001` (console) |
| `minio-init` | creates the private `openshoot` bucket, then exits | |
| `web` | Next.js server; migrates and seeds the database on start | `127.0.0.1:3000` |
| `worker` | `pnpm worker`: polls running jobs every 5 s and runs maintenance hourly | |

| Volume | Holds |
|---|---|
| `db-data` | the Postgres data directory |
| `minio-data` | every stored photo, training set and video |
| `app-data` (`/data`) | the generated `BETTER_AUTH_SECRET` (`/data/.auth-secret`) and local storage if you switch to `STORAGE_DRIVER=local` |

The `environment:` block in the compose file wires `web` and `worker` to the bundled `db` and `minio` and
**overrides** the matching `.env` values (`DATABASE_URL`, `STORAGE_DRIVER`, `S3_*`, `LOCAL_STORAGE_DIR`). To use
managed Postgres or R2 instead, delete those lines (and the services you no longer need); the values from `.env` are
then used.

The image's entrypoint ([`docker/entrypoint.sh`](../docker/entrypoint.sh)) has three roles: `web` (default: wait
for the database, migrate, seed, start), `worker`, and `migrate` (migrate and seed, then exit). Knobs:
`MIGRATE_ON_START` (default `true` for `web`, `false` for `worker`), `SEED_ON_START` (defaults to
`MIGRATE_ON_START`), `DB_WAIT_TIMEOUT` (seconds, default 60), `AUTH_SECRET_FILE` (where a generated
`BETTER_AUTH_SECRET` is kept, default `/data/.auth-secret`) and `LOOPBACK_FORWARD` (the Compose S3 wiring below).
Without Compose:

```bash
docker build -t openshoot .
docker run -p 3000:3000 --env-file .env -v openshoot-data:/data openshoot          # web
docker run --env-file .env -v openshoot-data:/data openshoot worker                 # worker
docker run --rm --env-file .env -v openshoot-data:/data openshoot migrate           # one-off migration
```

Mount the same `/data` volume into every container (or set `BETTER_AUTH_SECRET` in `.env`): without it, each
container generates its own secret, which is lost when the container is recreated.

### Configure `.env` for production

Starting from `.env.example`:

```
MOCK_PROVIDERS=false
NEXT_PUBLIC_APP_URL=https://photos.example.com
BETTER_AUTH_SECRET=<openssl rand -base64 32>
TRUSTED_PROXY_HOPS=1
FAL_KEY=…
STRIPE_SECRET_KEY=…
STRIPE_WEBHOOK_SECRET=…
RESEND_API_KEY=…
EMAIL_FROM="OpenShoot <hello@photos.example.com>"
SEED_ADMIN_EMAIL=you@example.com
NEXT_PUBLIC_SUPPORT_EMAIL=…
NEXT_PUBLIC_TAKEDOWN_EMAIL=…
NEXT_PUBLIC_LEGAL_ENTITY=…
POSTGRES_PASSWORD=<letters and digits>
MINIO_ROOT_USER=<letters and digits>
MINIO_ROOT_PASSWORD=<letters and digits>
```

Notes:

- When `BETTER_AUTH_SECRET` is empty (or a published placeholder), the entrypoint generates a random secret on first
  start and keeps it in the `app-data` volume, shared by `web` and `worker`. Setting your own is better for
  production: it survives volume loss and you can store it with your other secrets.
- `POSTGRES_PASSWORD` is only applied when the `db-data` volume is first created. Changing it later doesn't change
  the database user's password (change it with `ALTER USER` as well).
- `NEXT_PUBLIC_*` values are baked into the image at build time (Compose passes them as build args): run
  `docker compose up -d --build` after changing them.
- `CRON_SECRET` isn't needed: the worker does what Vercel Cron does. Set `WORKER_MAINTENANCE_INTERVAL_MS=0` if an
  external scheduler calls `/api/cron/maintenance` instead.

### Reverse proxy and HTTPS

`web` is only published on the host's loopback interface (`127.0.0.1:3000`). Put a TLS-terminating reverse proxy in
front of it. With
[Caddy](https://caddyserver.com) (automatic HTTPS) on the host:

```
photos.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

nginx or Traefik work the same way. Set `TRUSTED_PROXY_HOPS=1` (2 if a CDN such as Cloudflare sits in front of
the proxy). Otherwise client IPs are unknown and the per-IP rate limits (magic links, reports, deletion
confirmations) are shared by every visitor. Set the proxy's request body limit to about 10 MB (nginx:
`client_max_body_size 10m`): photo uploads are capped at 8 MB by the app, and the proxy limit bounds everything else.

### Webhooks

`WEBHOOK_BASE_URL` defaults to `NEXT_PUBLIC_APP_URL`. Once that is a public URL (not `localhost`), new jobs ask the AI
provider to call `<WEBHOOK_BASE_URL>/api/webhooks/ai/<provider>`, and Stripe should be pointed at
`<WEBHOOK_BASE_URL>/api/webhooks/payments/stripe` (events listed in the [Stripe section](#4-payments-stripe)). Set
`WEBHOOK_BASE_URL` only when providers must reach the app on a different host than users do. Webhooks are an
optimization for AI jobs: the worker polls running jobs every 5 seconds whatever happens (`WORKER_POLL_INTERVAL_MS`,
`WORKER_BATCH_LIMIT`).

### Storage on a remote server

Presigned URLs embed and sign the storage host, so browsers and the app must reach the same `S3_ENDPOINT`. The
compose default, `http://localhost:9000`, only works on your own machine: the browser reaches it through MinIO's
published port and, inside the containers, `LOOPBACK_FORWARD`
([`docker/loopback-forward.mjs`](../docker/loopback-forward.mjs)) forwards `localhost:9000` to the `minio` service.
AI providers can't reach a `localhost` endpoint either; the S3 driver detects such private endpoints and uploads job
inputs to the provider's own file storage instead (slower, and the provider keeps those copies for about a day). On
a public hostname the provider downloads inputs straight from the signed URLs, so that hostname must really be
reachable from the internet.

On a server, choose one:

- **Use R2 or S3 (simplest).** Delete the `S3_*`, `STORAGE_DRIVER` and `LOOPBACK_FORWARD` lines from the compose
  file's `environment:` block, remove the `minio` / `minio-init` services, and put the R2 settings from the
  [Vercel section](#2-storage-cloudflare-r2) in `.env`.
- **Expose MinIO on its own hostname.** Proxy a hostname to MinIO's API, keeping the `Host` header (Caddy does by
  default), e.g. `s3.photos.example.com { reverse_proxy 127.0.0.1:9000 }`. Then override the endpoint in a
  `docker-compose.override.yml` next to the compose file:

  ```yaml
  services:
    web:
      environment:
        S3_ENDPOINT: https://s3.photos.example.com
        LOOPBACK_FORWARD: ""
    worker:
      environment:
        S3_ENDPOINT: https://s3.photos.example.com
        LOOPBACK_FORWARD: ""
  ```

  The containers must be able to reach that hostname too (they resolve it like any client). Keep the bucket
  private: users and providers only ever get presigned URLs.

### Backups

Back up the database and the object store together, and keep the auth secret (or set `BETTER_AUTH_SECRET`
yourself).

```bash
# Database (custom format; restore with pg_restore)
docker compose exec -T db pg_dump -U openshoot -d openshoot -Fc > openshoot-$(date +%F).dump

# Restore into the running db service
docker compose exec -T db pg_restore -U openshoot -d openshoot --clean --if-exists < openshoot-2026-01-01.dump

# Object storage (stop minio for a consistent copy; volumes are prefixed with the project name "openshoot")
docker compose stop minio
docker run --rm -v openshoot_minio-data:/data -v "$PWD":/backup alpine tar czf /backup/minio-$(date +%F).tgz -C /data .
docker compose start minio
```

Account deletion is real: users' files are removed from storage and their rows from the database. Make sure old
backups expire on a schedule that matches your privacy policy.

---

## Choosing fal or Replicate

Both adapters implement every feature; model ids and prices live in [`src/config/models.ts`](../src/config/models.ts)
(sources and caveats in [MODELS.md](MODELS.md)).

| | fal (default) | Replicate |
|---|---|---|
| Setup | `FAL_KEY` only | `AI_PROVIDER=replicate`, `REPLICATE_API_TOKEN`, `REPLICATE_OWNER`, and `REPLICATE_WEBHOOK_SECRET` for webhooks |
| Webhooks | Verified with fal's public ED25519 keys (fetched from `rest.fal.ai`), no secret | Verified with the account's signing secret. Without `REPLICATE_WEBHOOK_SECRET` every webhook is rejected and jobs complete by polling only. Multi-image jobs are always polled (one prediction per image). |
| Trained models | LoRA file returned by the trainer | A private destination model `openshoot-…` per identity under `REPLICATE_OWNER` |
| Deleting a trained model | fal has no deletion API, so its copy of the LoRA is stored with a 1-day lifetime and expires on its own; OpenShoot copies the weights into your storage when training completes (`…/models/{id}/weights/`) and deletes that copy with the model | Versions and the destination model are deleted |
| Cost | Slightly higher for training and photos, much lower for talking videos ($1.72 vs ~$4.83 per 30 s) | Slightly cheaper training and photos; some prices are UNVERIFIED in MODELS.md |
| Local storage in dev | Inputs are uploaded to fal storage when your storage isn't public | Inputs are uploaded to Replicate files |

`REPLICATE_OWNER` is the Replicate username or organization that will own the private models created by training.
Get the webhook secret once with:

```bash
curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" https://api.replicate.com/v1/webhooks/default/secret
```

Jobs remember the provider that ran them, so switching `AI_PROVIDER` later doesn't break running jobs. Trained
identity models keep a reference to weights produced by the provider that trained them: test them on the new
provider, and plan for users to retrain, before you switch a live service.

## Safety providers

The safety module always runs a face provider and a moderation provider ([SAFETY.md](SAFETY.md),
[SAFETY_PROVIDERS.md](SAFETY_PROVIDERS.md)). With a real AI provider they default to the local models, which need
no keys and no network.

| | Option | Needs | Trade-offs |
|---|---|---|---|
| Face | `FACE_PROVIDER=local` (default) | nothing | @vladmandic/human in-process: face count, embeddings, age, pose. Strict match threshold (0.60): no false accepts in calibration, but about 31% of same-person pairs rejected; a consistency check, not identity proof. |
| Face | `FACE_PROVIDER=rekognition` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (IAM: `rekognition:DetectFaces`, `CompareFaces`, `RecognizeCelebrities`) | Hybrid: detection, age (the low bound of AWS's age range) and pose from Rekognition, embeddings still computed locally. About $0.001 per image (UNVERIFIED). Images leave your infrastructure. |
| Moderation | `MODERATION_PROVIDER=local` (default) | nothing | nsfwjs image classifier + rule-based text checks. English-first text filtering. |
| Moderation | `MODERATION_PROVIDER=openai` | `OPENAI_API_KEY` | `omni-moderation-latest` for text and images: multilingual, free endpoint, but data goes to OpenAI and outages block requests (fail closed). |

When AWS credentials are set, celebrity recognition (Rekognition `RecognizeCelebrities`) is added to moderation with
any backend, so uploaded references and consent selfies of public figures are refused. Changing `FACE_PROVIDER`
later invalidates stored consent embeddings: affected users retake the consent selfie. The local models need about
450 MB of memory per process (web and worker each).

## Production checklist

- [ ] `NEXT_PUBLIC_APP_URL` is your public `https://` URL and the image / deployment was rebuilt after setting it.
- [ ] `BETTER_AUTH_SECRET` is your own random value (`openssl rand -base64 32`) and stored somewhere safe.
- [ ] `MOCK_PROVIDERS=false`; `pnpm check-env` (with `NODE_ENV=production`) shows fal or Replicate, Stripe, Resend,
      S3 and real Postgres, and prints no warnings.
- [ ] Migrations applied (`pnpm db:migrate`, automatic in Docker).
- [ ] Storage bucket is private and its endpoint is reachable from browsers (and from the AI provider, when it is a
      public hostname).
- [ ] Stripe webhook endpoint registered with the events listed above; one live test purchase grants credits once;
      Customer Portal saved in live mode.
- [ ] Resend domain verified; a magic link arrives in a real inbox; `EMAIL_FROM` is on that domain.
- [ ] Vercel: `CRON_SECRET` set and crons visible under Project → Settings → Cron Jobs; functions have ≥ 1024 MB.
      Docker: the `worker` service is running.
- [ ] Reverse proxy terminates HTTPS and `TRUSTED_PROXY_HOPS` matches it (Vercel: default 1).
- [ ] Legal pages reviewed: `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_JURISDICTION`,
      `NEXT_PUBLIC_SUPPORT_EMAIL` and a monitored `NEXT_PUBLIC_TAKEDOWN_EMAIL`. The terms, privacy and acceptable-use
      texts are templates: have them reviewed for your jurisdiction.
- [ ] An admin account exists (`ADMIN_EMAILS` or `SEED_ADMIN_EMAIL`) and someone checks `/admin/moderation`.
- [ ] Credit prices reviewed against your provider costs ([README: What it costs to run](../README.md#what-it-costs-to-run)).
- [ ] Database and storage backups scheduled and a restore tested.
- [ ] `DEMO_MODE` is off and `SIGNUP_BONUS_CREDITS` is what you intend.

## Upgrading and migrations

1. Read the release notes and back up the database (and storage, for major upgrades).
2. **Docker:** `git pull && docker compose up -d --build`. `web` applies new migrations before it starts serving;
   `worker` starts once `web` is healthy. A Postgres advisory lock keeps concurrent migrations from overlapping.
3. **Vercel:** run `DATABASE_URL="…direct…" pnpm db:migrate` from the new version's checkout, then deploy (or promote
   the preview). Migrations are plain SQL in [`drizzle/`](../drizzle) and are applied in order, once each.
4. Run `pnpm check-env` against the new version: new variables are documented in `.env.example`.

If you change `src/db/schema.ts` yourself, create a migration with `pnpm db:generate` and commit the generated SQL.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The app refuses to start with "Invalid environment configuration" | The message lists each problem. Common ones: a short or placeholder `BETTER_AUTH_SECRET`; "AI_PROVIDER=fal in production requires real payments and email" (set `MOCK_PROVIDERS=false` and configure Stripe + Resend); a provider selected without its keys. On Vercel the same error can fail the build while pages prerender. |
| "Safety: FACE_PROVIDER and MODERATION_PROVIDER cannot be 'mock'…" | Remove `FACE_PROVIDER=mock` / `MODERATION_PROVIDER=mock`; the defaults (`local`) need no keys. |
| Magic-link emails never arrive | Check the Resend dashboard: the `EMAIL_FROM` domain must be verified. In mock mode emails are only shown at `/dev/emails` (in production that page only works when AI, payments and email all run on mocks and mock email was chosen explicitly with `MOCK_PROVIDERS=true` or `EMAIL_PROVIDER=mock`). |
| "Too many requests" on sign-in for everyone | Behind a reverse proxy with `TRUSTED_PROXY_HOPS=0` all visitors share one IP bucket. Set it to the number of proxies. |
| Jobs stay "running" | Webhooks are disabled while `WEBHOOK_BASE_URL`/`NEXT_PUBLIC_APP_URL` is localhost, and nothing polls: run `pnpm worker` (Docker: check the `worker` service), check the Vercel crons and `CRON_SECRET`. Jobs time out after 2 hours (training 6 hours) and are refunded. |
| Jobs fail at the provider right after submit (download or input errors) | The provider can't fetch the signed input URL: `S3_ENDPOINT` is a public-looking hostname the provider can't reach (firewall, split DNS, a proxy that rewrites `Host`). `localhost` / private-IP endpoints are detected and inputs are uploaded to the provider instead. See [Storage on a remote server](#storage-on-a-remote-server). |
| Photos don't load in the browser | `S3_ENDPOINT` isn't reachable from the browser, or a proxy in front of MinIO rewrites the `Host` header (signatures then fail). |
| Stripe webhook returns 400 | Wrong `STRIPE_WEBHOOK_SECRET` (each endpoint and each `stripe listen` session has its own). 404 means `PAYMENT_PROVIDER` isn't `stripe`. 409 means another request is still applying the same event, and 500 that applying it failed (the error is stored in the `webhook_events` table): Stripe redelivers both. |
| Replicate webhooks return 401 | `REPLICATE_WEBHOOK_SECRET` is missing or wrong. Jobs still finish through polling. |
| "prepared statement … does not exist" | A transaction pooler whose URL doesn't contain `pooler`, `pgbouncer` or `:6543`, so prepared statements stay on. Use the provider's standard pooler URL, or a direct connection. |
| "PGlite is not available" in production | Production builds leave the embedded PGlite database out of the deployment. Use a `postgres://` `DATABASE_URL` (or build with `OPENSHOOT_TRACE_PGLITE=true` if you really want an embedded database). |
| Out-of-memory or very slow first requests | Safety models need about 450 MB: raise function memory (Vercel ≥ 1024 MB) or the container's memory limit. |
| Vercel rejects the deployment because of cron jobs | Hobby plan: change the `/api/cron/jobs` schedule in `vercel.json` to daily. |
| Uploads fail with 413 | Raise the reverse proxy's body size limit. On Vercel, API clients must keep uploads under 4.5 MB (the web app resizes before uploading). |
| Everyone was signed out after a restart (Docker) | The `app-data` volume holding the generated secret was removed. Set `BETTER_AUTH_SECRET` explicitly. |
| Users must redo their consent selfie | `FACE_PROVIDER` changed: embeddings from different face models aren't comparable, so they never match (by design). |

## Demo mode

`DEMO_MODE=true` turns a deployment into a public, one-click demo. It only starts with mock AI and mock payments
(`MOCK_PROVIDERS=true`, or `AI_PROVIDER=mock` + `PAYMENT_PROVIDER=mock`), so nobody can spend real provider money
through it. With it on:

- The landing page hero and `/login` show **Try the live demo**. Each click (`POST /api/demo/login`) creates a fresh
  account `demo+<random>@demo.invalid` named "Demo user" with 300 credits (ledger reason `admin_adjust`, note
  `demo`), a ready Instant identity model built from synthetic selfies rendered by the mock provider (they still go
  through the consent, photo-quality and safety checks; the consent record says `captureMethod: "demo-seed"`), and
  starts one 6-image LinkedIn Headshots batch. The visitor is signed in (a normal Better Auth session) and lands on
  that batch, which fills in within seconds.
- Demo accounts see a dismissible "You're in a demo — data is deleted after 24h" banner in the app.
- Maintenance (`/api/cron/maintenance` or the Docker `worker`) deletes demo accounts older than 24 hours with the
  regular account deletion (models, storage, rows), up to 25 per run. It keeps doing so after you turn demo mode
  off, so no demo data is left behind. `.invalid` is a reserved domain, so a real account can never match.
- Abuse limits: 5 demo accounts per IP per hour and 120 per hour for the whole deployment
  (`demoLoginsPerHourPerIp`, `demoLoginsPerHour` in `src/config/rate-limits.ts`). Set `TRUSTED_PROXY_HOPS` behind a
  reverse proxy, or every visitor shares one IP bucket. Cross-site POSTs are refused.
- With `DEMO_MODE` off, `/api/demo/login` answers 404 and no demo button is shown. The landing page is static, so
  its button asks `GET /api/demo/login` at runtime (cached for 5 minutes) whether to appear.

Size the storage volume for it: every demo account stores a few MB (selfies plus the first batch) for a day.
