# OpenShoot

**Your AI photographer. Open source.** Upload a few selfies, get a private identity model, then create professional
headshots, dating photos, travel shots, edits and videos of yourself. Run it for yourself or as a business.

[![CI](https://github.com/amankaushik481/openphotoai/actions/workflows/ci.yml/badge.svg)](https://github.com/amankaushik481/openphotoai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

OpenShoot is a complete, self-hostable AI photo studio and SaaS: identity models (instant or LoRA-trained), 64 photo
packs, prompt and pose-copy generation, editing, upscaling, photo-to-video and talking videos, a gallery, credits and
Stripe billing, teams, a public API and an admin dashboard. It runs with **zero API keys** in mock mode, ships as one
Next.js app (one Docker image, one Vercel project), and treats safety (consent, adults only, no sexual content) as a
core module that cannot be switched off. The product name is configurable: set `NEXT_PUBLIC_APP_NAME` to rebrand it.

**Why it's better than the closed alternatives**

- **Honest credits.** Credits never expire. Failed jobs, blocked outputs, cancellations and low-likeness photos are
  refunded automatically, and every debit and refund is in an append-only ledger.
- **Fast.** Instant identity models are ready in seconds with no training cost; free draft previews re-render at full
  quality with the same seed.
- **Looks like you, or you don't pay.** Every output gets a likeness score against your consent selfie; photos
  below the likeness threshold are refunded and discarded, and weaker shots are hidden (likeness guarantee).
- **Open.** MIT licensed, self-hostable, public REST API with an OpenAPI 3.1 spec, packs are plain JSON files, and
  AI / payment / email / storage / safety providers are swappable adapters.
- **Safe by design.** Live consent selfie, face matching on every training photo, adults only, prompt and output
  moderation on every image and video, AI-generated labels, real deletion.

## Screenshots

| Landing | Create |
|---|---|
| ![Landing page](docs/screenshots/landing.png) | ![Create page: prompt, pack, drafts](docs/screenshots/create.png) |
| **Gallery** | **New identity model** |
| ![Gallery with filters and bulk actions](docs/screenshots/gallery.png) | ![Model wizard: consent selfie and photo quality check](docs/screenshots/models-new.png) |
| **Admin** | |
| ![Admin dashboard](docs/screenshots/admin.png) | |

## Features

### Core

- **Selfie upload with a quality checker.** 10–30 photos (Trained) or as few as 3 (Instant). Photos are resized in the
  browser and EXIF/GPS is stripped on the server. Each photo is checked for resolution, blur, exposure, contrast,
  exactly one face, face size, head-pose variety and near-duplicates, and must match your consent selfie. Every issue
  comes with a plain-language fix-it tip, and a readiness panel shows what is still missing.
- **Two identity modes.** *Instant* (reference-based, free, ready in seconds) and *Trained* (FLUX LoRA, best
  likeness, 40 credits) with progress UI and a "model ready" email.
- **Generate** from a prompt, a pack or a style reference, with aspect ratios, 1–4 images per job and seed control.
- **64 photo packs** in `packs/*.json` (headshots, dating, travel, seasonal…). Adding one is adding a file; public
  pack pages double as SEO landing pages ([docs/ADDING_PACKS.md](docs/ADDING_PACKS.md)).
- **Pose / style copy.** Upload any reference photo and get yourself in that pose and setting.
- **Edit.** Change outfit, background, hair or expression with an instruction, or paint a mask (brush inpainting).
- **Upscale** 2× / 4×, **face restore** and **background removal**.
- **Photo → video** (5 s / 10 s) and **talking videos** from a script (TTS voice + lip-sync).
- **Virtual try-on.** Upload a garment and see it on one of your photos.
- **Together photos.** Combine your model with a friend's, after they accept an in-app invite.
- **Gallery** with favorites, folders, filters (model / pack / kind / batch), bulk select, zip download and share
  links.

### Beyond photoai.com

- **Instant drafts**: free fast previews (30 a day after a first purchase, 5 a day before), then "Full quality"
  re-renders the same seed.
- **Best-shots picker and likeness guarantee**: outputs are scored for likeness and quality; weak ones are hidden,
  and ones that don't look like you are refunded and discarded.
- **Prompt helper**: "me on a yacht at sunset looking rich" becomes an optimized prompt (LLM, with a template
  fallback).
- **Batch mode**: one pack → up to 50 images in one click with live progress.
- **Brand kits for teams**: background, outfit, style, lighting and aspect presets applied to every member's
  headshots.
- **Public API**: API keys with scopes, OpenAPI 3.1 at `/api/v1/openapi.json`, docs at `/docs/api`
  ([docs/API.md](docs/API.md)).
- **Mobile-first**: bottom navigation on phones and camera capture for the consent selfie.
- **Privacy**: training photos deletable any time; account deletion really deletes (storage, provider-side models,
  rows) and is confirmed by email.

### SaaS layer

- Landing, pricing, FAQ, packs gallery and legal pages (terms, privacy, acceptable use with a takedown contact) as
  editable templates driven by `NEXT_PUBLIC_*` settings.
- Sign-in with magic links or Google (Better Auth).
- Stripe Checkout for subscriptions and one-time credit packs with inline prices (no products to create in Stripe),
  customer portal, idempotent and out-of-order-safe webhooks, refund and chargeback handling. A built-in mock checkout
  works without Stripe.
- Plans with limits (identity models, batch size, concurrent jobs, API access, team seats). Defaults: Free, Starter
  $15, Pro $39, Studio $99 per month; credit packs of 100 / 500 / 1,500 ([src/config/plans.ts](src/config/plans.ts)).
- Teams: seats, roles, shared brand kits and credit transfers (Studio plan).
- Admin dashboard: users (search, adjust credits, suspend), jobs (failures, refunds), revenue, provider cost per job,
  moderation queue.
- Transactional emails (React Email): magic link, welcome, model ready, training failed, low credits, receipt,
  invites, deletion, suspension.
- Optional one-click public demo (`DEMO_MODE`, mock providers only): throwaway accounts with a ready model and
  credits, deleted after 24 hours.
- i18n-ready (English shipped), optional PostHog analytics (off unless a key is set), dark mode.

### Safety (always on)

Live consent selfie with an active head-pose challenge, face match of every training photo against it, adults only
(estimated age ≥ 20 for identities and for every face in an output), a prompt filter plus a moderation provider on
every prompt, an output classifier on every image and video (blocked outputs are never stored and are refunded),
public-figure blocking, multi-person consent, IPTC "AI-generated" metadata on every output plus a visible watermark
on the free tier, reports, a moderation queue, suspension and rate limits. See [Safety](#safety).

## Quick start (5 minutes, no API keys)

### Option A: Docker

Requires Docker with Compose v2.

```bash
git clone https://github.com/amankaushik481/openphotoai.git openshoot && cd openshoot
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. The first build takes a few minutes. Compose starts Postgres 16, MinIO (S3) with a
private bucket, the web app (it migrates and seeds the database on start) and a background job worker. Everything
runs on mock providers, so the UI shows a "Demo mode" banner.

1. **Sign in** with any email address. No email is sent: open the dev mailbox at <http://localhost:3000/dev/emails>
   and click the magic link.
2. **Buy credits** at `/app/billing`: the mock checkout grants them for free.
3. **Create a model** at `/app/models/new` (consent selfie with your camera, then photos), then generate at
   `/app/create`. Mock outputs are placeholder images.
4. **Make yourself admin** (access to `/admin`):

   ```bash
   docker compose run --rm -e SEED_ADMIN_EMAIL=you@example.com web migrate
   ```

   This runs the idempotent migrate + seed step, which creates that user or promotes an existing one. Then sign in
   with that email. Alternatively add `ADMIN_EMAILS=you@example.com` to `.env` and recreate the containers
   (`docker compose up -d --force-recreate`): listed emails become admins at their next sign-in.

`docker compose down` stops everything and keeps your data; `docker compose down -v` deletes it.

### Option B: local development

Requires Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
git clone https://github.com/amankaushik481/openphotoai.git openshoot && cd openshoot
pnpm install
cp .env.example .env    # mock providers, embedded Postgres (PGlite in ./.data/pglite), local disk storage
pnpm run setup          # checks the environment, migrates and seeds (safe to re-run)
pnpm dev                # http://localhost:3000
```

No database server is needed: `DATABASE_URL=pglite:./.data/pglite` runs an embedded Postgres in a local folder.
Sign in with any email and open <http://localhost:3000/dev/emails> for the magic link. To become admin, set
`SEED_ADMIN_EMAIL=you@example.com` in `.env` and run `pnpm run setup` again (or `pnpm db:seed`).
`pnpm check-env` shows which providers are active.

(`pnpm setup` is a built-in pnpm command, so the bootstrap script is `pnpm run setup`, alias `pnpm bootstrap`.)

### Going live

Set `MOCK_PROVIDERS=false` and configure the real providers: an AI provider (fal by default), Stripe, Resend,
S3-compatible storage and real Postgres. In production, a real AI provider requires real payments and real email,
and the safety providers can never be mocks; `src/lib/env.ts` refuses to start otherwise. The full walkthrough for
Vercel and Docker is in **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Famankaushik481%2Fopenphotoai&project-name=openshoot&repository-name=openshoot&env=DATABASE_URL,BETTER_AUTH_SECRET,NEXT_PUBLIC_APP_URL,FAL_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,RESEND_API_KEY,EMAIL_FROM,STORAGE_DRIVER,S3_ENDPOINT,S3_BUCKET,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,CRON_SECRET&envDescription=Keys%20for%20a%20live%20deployment.%20Set%20STORAGE_DRIVER%20to%20s3%20and%20NEXT_PUBLIC_APP_URL%20to%20your%20site%20URL.%20Every%20value%20is%20explained%20in%20docs%2FSELF_HOSTING.md.&envLink=https%3A%2F%2Fgithub.com%2Famankaushik481%2Fopenphotoai%2Fblob%2Fmain%2Fdocs%2FSELF_HOSTING.md%23deploy-on-vercel)

The button clones the repo and asks for the variables a live deployment needs. Before the app works you also need to
apply the database migrations, register the Stripe webhook and (on the Hobby plan) change the every-minute cron in
`vercel.json` to a daily one. Follow [docs/SELF_HOSTING.md → Deploy on Vercel](docs/SELF_HOSTING.md#deploy-on-vercel).

## What it costs to run

Provider cost per action at the default models (estimates from [docs/MODELS.md](docs/MODELS.md) §E and
[src/config/models.ts](src/config/models.ts), researched November 2026; re-check prices before launch). Credits are
what users are charged ([src/config/credits.ts](src/config/credits.ts)). At the default prices one credit sells for
$0.05 (Studio plan) to $0.09 (100-credit pack).

| Action | Credits | fal (default) | Replicate |
|---|---|---|---|
| Instant identity model | 0 | $0 | $0 |
| Trained identity model (1,000 steps) | 40 | $2.00 | ~$1.50 |
| Draft preview (per image, daily cap) | 0 | ~$0.035 | ~$0.032 |
| Photo, standard (per image, trained model) | 1 | $0.035 | $0.032 |
| Photo, standard (per image, instant model) | 2 | $0.08 | ~$0.08 |
| Pose copy / edit (per image) | 2 | $0.08 | ~$0.08 |
| Brush inpaint | 2 | $0.035 | $0.05 |
| Upscale 2× / 4× | 2 / 5 | $0.064 / ~$0.13 | ~$0.05 / ~$0.10 |
| Face restore / background removal | 1 / 1 | ~$0.005 / ~$0.002 | ~$0.005 / ~$0.002 |
| Virtual try-on | 3 | $0.075 | ~$0.08 |
| Together photo (per image) | 3 | $0.08 | ~$0.08 |
| Photo → video, 5 s / 10 s | 10 / 18 | $0.42 / $0.84 | ~$0.35 / ~$0.70 |
| Talking video, 30 s (TTS + lip-sync) | 48 (8 per started 5 s) | $1.72 | ~$4.83 |
| Prompt helper call | 0 | ~$0.0005 | ~$0.001 |
| Safety checks (local face + moderation models) | 0 | $0 (CPU only) | $0 (CPU only) |

"High quality" photos cost 2 credits and render up to 2 MP on fal (billed per megapixel, so about twice a standard
photo). Watch two margins if you change prices: training on the Studio plan is roughly break-even on fal, and talking
videos on Replicate cost more than the credits they are sold for.

**One training + 100 photos** (fal default / Replicate):

| | fal | Replicate |
|---|---|---|
| Training (1,000 steps) | $2.00 | $1.50 |
| 100 standard photos | $3.50 | $3.20 |
| **Core** | **$5.50** | **$4.70** |
| + 100 free drafts, 100 prompt-helper calls, 20 upscales (2×) | +$4.83 | +$4.30 |
| **Realistic total** | **~$10.35** | **~$9.00** |

The same user pays 140 credits for the core (40 + 100), which fits in a Starter month (200 credits, $15).

## Mocked vs live

`MOCK_PROVIDERS=true` (the `.env.example` default) makes every provider default to its mock. Explicit `*_PROVIDER`
values still win, so you can mix (e.g. real fal, mock email) in development.

| Area | Mock (no keys) | Live options | Variables |
|---|---|---|---|
| AI (train, generate, edit, video) | Deterministic placeholder images and videos after `MOCK_JOB_DELAY_MS`; prompt directives like `[mock:fail]` for tests | **fal** (default), Replicate | `AI_PROVIDER`, `FAL_KEY`, `REPLICATE_*` |
| Payments | Built-in checkout page that grants credits and plans for free | Stripe | `PAYMENT_PROVIDER`, `STRIPE_*` |
| Email | Recorded and readable at `/dev/emails`, never delivered | Resend | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` |
| Face analysis | Deterministic fake faces and embeddings (test markers) | **local** (in-process @vladmandic/human, no key), Rekognition | `FACE_PROVIDER`, `AWS_*` |
| Moderation | Marker-based verdicts; the rule-based prompt filter still runs | **local** (nsfwjs + rules, no key), OpenAI | `MODERATION_PROVIDER`, `OPENAI_API_KEY` |
| Storage | n/a (local disk is real) | local disk, any S3-compatible bucket (R2, S3, MinIO, B2) | `STORAGE_DRIVER`, `S3_*` |
| Database | n/a (PGlite is real Postgres, embedded) | Postgres 14+ (Neon, Supabase, RDS, Docker) | `DATABASE_URL` |
| Analytics | off | PostHog | `NEXT_PUBLIC_POSTHOG_KEY` |

Every variable is documented in [.env.example](.env.example) and validated by [src/lib/env.ts](src/lib/env.ts).

## Tech stack

- **Framework:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript (strict)
- **UI:** Tailwind CSS v4, Radix UI with shadcn-style components, Lucide icons, SWR, next-themes
- **Data:** PostgreSQL with Drizzle ORM, PGlite (embedded Postgres) for development and tests
- **Auth:** Better Auth (magic links, Google OAuth, sessions), hashed API keys
- **Validation:** Zod 4 (request bodies, job inputs, env, packs)
- **AI:** fal (`@fal-ai/client`) or Replicate; FLUX LoRA, Nano Banana, Kling, MiniMax and more ([docs/MODELS.md](docs/MODELS.md))
- **Media:** sharp (images, EXIF stripping, XMP labels, watermarks), ffmpeg-static (video frames, labels)
- **Safety:** @vladmandic/human + nsfwjs on TensorFlow.js (wasm, in-process), optional AWS Rekognition / OpenAI moderation
- **Payments / email / storage:** Stripe, Resend + React Email, AWS SDK S3 client (R2, S3, MinIO)
- **Testing:** Vitest 5, Playwright 1.63; **Deploy:** Docker Compose or Vercel (crons included)

## Project structure

```
src/
  app/              Next.js pages and API routes (marketing, /app, /admin, /api, /api/v1)
  components/       UI: ui/ (design system), app/ (shared), one folder per feature
  server/           Server-only domain code: jobs engine + handlers, safety, credits, billing, models,
                    media, gallery, teams, together, account, admin, email, storage, packs, auth, openapi
  providers/        Adapter interfaces (types.ts), registry.ts, mock/, ai/ (fal, replicate),
                    safety/, payment/, email/, storage/
  config/           Branding, plans, credit costs, model ids, rate limits
  db/               Drizzle schema (27 tables) and client
  emails/           React Email templates
  lib/              env validation, ids, API client, utils
  i18n/, content/, hooks/, types/
packs/              64 photo packs (JSON)
drizzle/            SQL migrations
scripts/            setup, migrate, seed, worker, check-env, validate-packs, calibrate-face
docker/             Container entrypoint and helpers
tests/              unit/ (Vitest), e2e/ (Playwright), fixtures/, helpers/
docs/               Specs, guides and reviews (index: docs/README.md)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server on :3000 |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm run setup` (alias `pnpm bootstrap`) | Check env → migrate → seed |
| `pnpm db:generate` | Create a migration from `src/db/schema.ts` changes |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / validate packs and create the `SEED_ADMIN_EMAIL` admin |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm worker` | Background job poller + hourly maintenance (Docker's `worker` service) |
| `pnpm check-env` | Validate the environment and show active providers and warnings |
| `pnpm packs:validate` | Validate the packs in `packs/` |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | TypeScript, ESLint, Prettier |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm email:dev` | Preview email templates on :3010 |

## Testing

- **Unit tests** (`pnpm test`): Vitest with an in-memory PGlite database per test (`tests/helpers/db.ts`) and mock
  providers, so they need no services or keys. Provider adapters are tested with mocked HTTP; no test calls a paid
  API.
- **End-to-end tests** (`pnpm test:e2e`): Playwright builds and starts the app on port 3100 with mock providers and a
  fake camera, against a real Postgres database that it recreates on every run (`E2E_DATABASE_URL`, default
  `postgres://openshoot:openshoot@localhost:5432/openshoot_e2e`; the name must contain `e2e` or `test`). Specs cover a
  smoke test, the full journey (sign up → credits → train → create → edit → upscale → video → zip → delete account),
  billing and refunds, and safety (someone else's photos, minors, explicit prompts, multi-person consent).

  ```bash
  docker run -d --name openshoot-e2e-db -p 5432:5432 -e POSTGRES_USER=openshoot \
    -e POSTGRES_PASSWORD=openshoot -e POSTGRES_DB=openshoot_e2e postgres:16-alpine
  pnpm exec playwright install chromium
  pnpm test:e2e
  ```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs typecheck, lint, pack validation, unit tests and a
build, then the Playwright suite against Postgres 16.

## Safety

OpenShoot makes realistic photos of real people, so the safety module (`src/server/safety`) is part of the core and
has no off switch: no env variable, plan or admin setting disables it.

- **Consent:** a live camera selfie with a random head-pose challenge; every training photo must face-match it.
- **Adults only:** identities must be estimated at 20+ (18 plus a margin); prompts about minors are refused.
- **No sexual content, no minors in outputs:** a rule-based prompt filter plus the moderation provider on every
  prompt, and an output classifier and age gate on every image and on sampled video frames. Blocked outputs are
  never stored and are refunded.
- **No public figures:** name and phrase filters, plus celebrity recognition on uploads when AWS is configured.
- **Multi-person consent:** a friend's model can only be used after their accepted invite.
- **Labels and accountability:** IPTC `trainedAlgorithmicMedia` metadata on every output, a free-tier watermark,
  report button, moderation queue, suspension, takedown contact, rate limits.
- **Fail closed:** if a classifier or face model fails, the request is blocked.
- **Real AI ⇒ real safety:** `src/lib/env.ts` refuses mock face or moderation providers when a real AI provider is
  configured. The local providers need no keys.

Details, thresholds and known limitations: [docs/SAFETY.md](docs/SAFETY.md) and
[docs/SAFETY_PROVIDERS.md](docs/SAFETY_PROVIDERS.md). Report vulnerabilities and safety bypasses privately as
described in [SECURITY.md](SECURITY.md).

## Documentation

All docs are indexed in [docs/README.md](docs/README.md). The most useful ones:
[SELF_HOSTING](docs/SELF_HOSTING.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) ·
[ADDING_PROVIDERS](docs/ADDING_PROVIDERS.md) · [ADDING_PACKS](docs/ADDING_PACKS.md) · [API](docs/API.md) ·
[SAFETY](docs/SAFETY.md) · [MODELS](docs/MODELS.md) · [CONTRACTS](docs/CONTRACTS.md) · [DECISIONS](docs/DECISIONS.md)

## Contributing

Contributions are welcome: bug fixes, packs, providers, translations and docs. Read
[CONTRIBUTING.md](CONTRIBUTING.md) (setup, conventions, tests) and the [Code of Conduct](CODE_OF_CONDUCT.md). Two
ground rules: everything must keep working with mock providers and zero keys, and safety checks can't be weakened.

## License

[MIT](LICENSE). Model weights and hosted APIs you connect (fal, Replicate, FLUX, Kling…) have their own licenses and
terms; check them before running a commercial service.

## Acknowledgements

Built on [Next.js](https://nextjs.org), [React](https://react.dev), [Better Auth](https://www.better-auth.com),
[Drizzle ORM](https://orm.drizzle.team), [PGlite](https://pglite.dev), [Tailwind CSS](https://tailwindcss.com),
[Radix UI](https://www.radix-ui.com) and [shadcn/ui](https://ui.shadcn.com),
[React Email](https://react.email), [sharp](https://sharp.pixelplumbing.com),
[FFmpeg](https://ffmpeg.org), [@vladmandic/human](https://github.com/vladmandic/human),
[NSFWJS](https://github.com/infinitered/nsfwjs) and [TensorFlow.js](https://www.tensorflow.org/js). Generation runs
on [fal](https://fal.ai) or [Replicate](https://replicate.com) with models from Black Forest Labs (FLUX), Google,
Kuaishou (Kling), MiniMax, FASHN and others. Payments by [Stripe](https://stripe.com), email by
[Resend](https://resend.com).
