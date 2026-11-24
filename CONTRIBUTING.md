# Contributing to OpenShoot

Thanks for helping build an open-source, self-hostable AI photographer! Bug fixes, photo packs, providers, docs and
translations are all welcome. By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues and safety bypasses go through [SECURITY.md](SECURITY.md), never public issues.

Two ground rules shape every change:

1. **Mock-first.** Everything runs with `MOCK_PROVIDERS=true` and zero API keys. Tests never call paid APIs.
2. **Safety can't be switched off.** Consent, age checks, moderation, AI labels and rate limits are core features
   (`src/server/safety`). Don't add flags, env variables or code paths that bypass them.

## Local setup

Requirements: **Node 22** (see `.nvmrc`), **pnpm 10** via Corepack, and optionally Docker.

```bash
git clone https://github.com/amankaushik481/openphotoai.git && cd openphotoai
corepack enable            # provides the pnpm version pinned in package.json
pnpm install
cp .env.example .env       # defaults: mock providers, embedded Postgres (PGlite), local disk storage
pnpm run setup             # checks env, migrates and seeds the database (safe to re-run)
pnpm dev                   # http://localhost:3000
```

Sign in with any email address: in mock mode no email is sent, and the magic link appears at
<http://localhost:3000/dev/emails>. Set `SEED_ADMIN_EMAIL` in `.env` and re-run `pnpm run setup` to get an admin
account (`/admin`).

Every variable is documented in [`.env.example`](.env.example) and validated by [`src/lib/env.ts`](src/lib/env.ts);
`pnpm check-env` shows which providers are active.

### With Docker

```bash
cp .env.example .env
docker compose up --build  # web on :3000, MinIO API on :9000 and console on :9001
```

Compose runs Postgres 16, MinIO (S3) with a private bucket, the web app (migrates + seeds on start) and the job
worker, all from the same image. It overrides the database and storage settings from `.env`, so the defaults work
unchanged. `NEXT_PUBLIC_*` values are baked in at build time: run `docker compose build` after changing them.
`docker compose down -v` deletes all data. See the comments in [`docker-compose.yml`](docker-compose.yml) and
[`Dockerfile`](Dockerfile) for the details (image layout, roles, S3 endpoint wiring).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm typecheck` | TypeScript (strict) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier (config in `.prettierrc`) |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests (in-memory PGlite, mock providers) |
| `pnpm test:e2e` | Playwright end-to-end tests (needs Postgres, see below) |
| `pnpm run setup` | Check env → migrate → seed (alias `pnpm bootstrap`) |
| `pnpm db:generate` | Create a migration from `src/db/schema.ts` changes |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / validate packs and create the seed admin |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm worker` | Background job poller (what the Docker `worker` service runs) |
| `pnpm check-env` | Validate the environment and show active providers |
| `pnpm packs:validate` | Validate the photo packs in `packs/` |
| `pnpm email:dev` | Preview email templates on :3010 |

## Project map

- `src/app` — Next.js App Router pages and API routes (`src/proxy.ts` does optimistic auth redirects only).
- `src/server` — server-only domain code: jobs engine and handlers, safety, credits, storage, email, packs, auth.
- `src/providers` — provider interfaces (`types.ts`), the registry, and mock / real implementations.
- `src/config` — branding, plans, credit costs, model ids, rate limits. `src/db` — Drizzle schema and client.
- `packs/` — photo packs (JSON). `drizzle/` — SQL migrations. `scripts/` — CLI scripts. `tests/` — unit and e2e.
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) (contracts, conventions, API routes), [`docs/SPEC.md`](docs/SPEC.md),
  [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Conventions

- TypeScript strict; no `any` without a justified `eslint-disable` comment. Prettier + EditorConfig formatting.
- Server-only code lives in `src/server/**` and `src/providers/**`; never import it from client components.
- Route handlers use `route()` from `src/server/http.ts`, validate input with Zod and throw `AppError`/`errors.*`.
- **Every query on user data filters by the owner's `userId`.** Storage keys come from `storageKeys.*` only.
- Money in integer cents, credits as integers, dates as ISO strings in DTOs, IDs from `newId()`.
- Model ids only from `src/config/models.ts`; user-facing copy through `t("key")` where practical.
- Next.js 16 differs from older versions (async `params`, `proxy.ts`…): check `node_modules/next/dist/docs/`.
- Small, focused modules; comments only where the logic isn't obvious. Accessible, mobile-first UI.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate`, commit the migration in `drizzle/`.
- New environment variables: validate them in `src/lib/env.ts` and document them in `.env.example`.

## Tests

- **Unit** (`tests/unit/<area>/*.test.ts`): `pnpm test`. Use `createTestDb()` / `createTestUser()` from
  `tests/helpers/db.ts` for an in-memory database; mock providers are on by default (`vitest.config.ts`).
- **End-to-end** (`tests/e2e/*.spec.ts`): Playwright builds and starts the app on port 3100 with mock providers and
  recreates the `E2E_DATABASE_URL` database (default `postgres://openshoot:openshoot@localhost:5432/openshoot_e2e`)
  on every run. Start a throwaway Postgres first, then run the tests:

  ```bash
  docker run -d --name openshoot-e2e-db -p 5432:5432 -e POSTGRES_USER=openshoot \
    -e POSTGRES_PASSWORD=openshoot -e POSTGRES_DB=openshoot_e2e postgres:16-alpine
  pnpm exec playwright install chromium
  pnpm test:e2e
  ```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck, lint, unit tests and a build on every push
and pull request, then the Playwright suite against Postgres.

## Adding a photo pack

1. Copy a pack in [`packs/`](packs) to `packs/<your-slug>.json`; the format is defined (and documented) by the Zod
   schema in [`src/types/pack.ts`](src/types/pack.ts).
2. Run `pnpm packs:validate`, then try it with mock providers (`/app/packs/<your-slug>`) and, ideally, a real one.
3. Packs must not contain nudity or sexual content, minors, real public figures, or brands/trademarks. Cover images
   must be AI-generated (with your own model) or licensed for this use.

## Adding a provider

1. Implement the interface from [`src/providers/types.ts`](src/providers/types.ts) in
   `src/providers/<kind>/<name>.ts`, exporting a cheap factory (`createXProvider(opts)`). Import heavy SDKs lazily
   inside methods (`await import(...)`).
2. Wire it in [`src/providers/registry.ts`](src/providers/registry.ts); add its variables to `src/lib/env.ts` (with
   validation of required keys) and `.env.example` (what it does, where to get it, required or optional).
3. Model ids go in `src/config/models.ts`. Keep provider-side safety checkers enabled; OpenShoot's own safety checks
   run on every input and output regardless.
4. Unit-test it with mocked HTTP (never real API calls) and document any webhook setup.

## Pull requests

- Keep PRs focused; open an issue first for large changes. Fill in the PR template checklist.
- UI changes: include screenshots for mobile and desktop.
- CI must be green. A maintainer will review as soon as possible.

## Infrastructure notes

- **Vercel**: `vercel.json` runs `/api/cron/jobs` every minute and `/api/cron/maintenance` daily (set `CRON_SECRET`).
  The Hobby plan only allows daily cron jobs, so on Hobby change the `/api/cron/jobs` schedule to a daily one: jobs
  still complete through provider webhooks and the lazy sync on `GET /api/jobs/:id`.
- **Docker**: one image, roles `web` (default), `worker` and `migrate` (`docker run … openshoot migrate`); see
  `docker/entrypoint.sh`.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
