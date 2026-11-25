# Docs accuracy review

Independent pass over README.md, CONTRIBUTING.md, SECURITY.md, `.env.example` (comments only) and
docs/{SELF_HOSTING, ARCHITECTURE, ADDING_PROVIDERS, ADDING_PACKS, API, SAFETY, SAFETY_PROVIDERS, SPEC, CONTRACTS,
KNOWN_ISSUES, DECISIONS, README}.md. Every claim was checked against the code as of 2026-11-24: `src/lib/env.ts`,
`package.json`, `src/app/api/**` (83 route files), `src/config/*`, `src/server/safety/**`, `src/server/billing/**`,
`src/providers/**`, `src/server/demo/**`, `src/server/maintenance/**`, Docker, `vercel.json` and CI. `pnpm
packs:validate --strict` was run (64 packs, 791 prompts, 0 errors, 0 warnings). No code was changed.

## Already accurate

The liveness description (2 of 4 head-pose steps, 5-minute single-use token, 12° / 8° deltas, dHash ≥ 2), video
sampling (1 frame/s across the whole clip + the last frame, max 32), age floors (20 identity / 19 reference / 20
output), Stripe event list, plans and pack prices, API scopes and error codes, demo mode, deletion steps, the 27
tables, cron schedules, worker defaults and the pack format all matched the code.

## Fixed

| File | Fixes | What |
|---|---|---|
| README.md | 6 | Talking video costs 12 credits per started 5 s (72 for 30 s), not 8 (48); credit price range and margin warnings recomputed (yearly Studio ≈ $0.04/credit makes fal training a loss; Replicate talking videos lose money on Pro and Studio); realistic total $10.33; project map lists `images`, `maintenance`, `demo` and the missing scripts; email list completed. |
| docs/SELF_HOSTING.md | 9 | Private S3 endpoints (localhost, private IPs, bare service names) are detected and inputs go to the provider's file storage, so a `localhost` MinIO no longer "makes every training fail" (R2 section, remote-storage section, troubleshooting, checklist); fal deletion row (weights copied into our storage, fal copy expires after 1 day); maintenance also prunes 30-day uploads and 90-day outbox rows; entrypoint knobs `AUTH_SECRET_FILE`, `LOOPBACK_FORWARD` and their defaults; `docker run` examples mount `/data` so web and worker share the generated secret; dev-mailbox production rule. |
| docs/ARCHITECTURE.md | 7 | Storage layout adds `weights/{jobId}.safetensors` and resized masks; training copies fal LoRAs; model deletion wording; provider inputs for private S3 endpoints; maintenance tasks; folder map adds `/docs`, public top-level pages and `src/server/demo`. |
| docs/CONTRACTS.md | 10 | Added missing routes: `GET /api/brand-kits`, `POST /api/billing/mock/cancel`, `POST /api/admin/moderation-events/:id/review`, `GET /api/dev/emails/latest`, `GET /api/demo/login`, `GET /api/v1/batches/:id`; `/api/credits` is session **or** API key; v1 scopes per route; payment webhook status codes; maintenance description; job lifecycle (negative balance, `draftsPerDayFree`, `assembledTexts`, sync throttle 3 s / 20 s / 60 s); handlers are no longer stubs; page map adds `/legal`, `/docs`, `/billing/mock-checkout`, `/dev/emails/[id]`; header rows so the sub-tables render. Every route under `src/app/api` now appears. |
| docs/SAFETY.md | 4 | Public-figure list is ~500 names (was "≥ 300"); text filter also covers a few nudity words in other Latin-script languages; the moderation queue cannot be filtered by kind (events are marked reviewed through `POST /api/admin/moderation-events/:id/review`). |
| docs/SPEC.md | 4 | 64 packs / 791 prompts (was "40+"); Instant mode needs "as few as 3" photos (no upper bound of 10); liveness challenge and output age gate; email list and demo mode. |
| docs/KNOWN_ISSUES.md | 1 | PERF-15: pool-size guidance and the `OPENSHOOT_TRACE_PGLITE` switch now exist; what remains is that both bypass the Zod env schema. |
| docs/DECISIONS.md | 1 | #27 marked superseded: photo-to-video now also refuses Together photos (SAF-12). |
| CONTRIBUTING.md | 4 | CI also validates packs (on PRs and pushes to `main`); `pnpm worker` runs maintenance; cover images come from demo identities (matches ADDING_PACKS); links to ADDING_PACKS / ADDING_PROVIDERS. |
| SECURITY.md | 2 | Consent flow includes the liveness challenge and output age checks; the free-tier watermark is a product setting (`WATERMARK_FREE_TIER`), so only bypassing it while enabled is a vulnerability. |
| .env.example (comments) | 6 | Auth secret variety rule; dev-mailbox production rule; `TRUSTED_PROXY_HOPS` range 0–10; documented `OPENSHOOT_TRACE_PGLITE`, the entrypoint knobs (`MIGRATE_ON_START`, `SEED_ON_START`, `DB_WAIT_TIMEOUT`, `AUTH_SECRET_FILE`) and `E2E_STORAGE_DIR`. |
| docs/README.md | 1 | Index entry for this report. |

## Not fixed

- **README screenshots are missing.** `docs/screenshots/{landing,create,gallery,models-new,admin}.png` don't exist,
  so the README's Screenshots table (and the `screenshots/` link in docs/README.md) is broken. Capturing them needs a
  running app, which was out of scope for this pass.
- `docker/auth-secret.mjs` (code comment) points at `tests/unit/core/auth-secret.test.ts`, which doesn't exist; the
  tests live in `tests/unit/security/env-production.test.ts`.
- ~~`src/config/plans.ts` highlights still say "All 40+ photo packs"~~ (fixed: "All 60+ photo packs").
- Third-party facts (Vercel Hobby cron and body limits, Stripe and Resend dashboard steps, provider prices marked
  UNVERIFIED in MODELS.md) were not re-checked. MODELS.md, RESEARCH.md and PROGRESS.md were only link-checked.
