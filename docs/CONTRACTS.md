# OpenShoot — Shared Contracts

Parallel workstreams build against these contracts. **Changing a contract requires updating this
file and telling every affected workstream** (record it in `docs/DECISIONS.md`). Contract code is
the source of truth; this file explains it.

## 1. Contract files (code)

| File | What it defines | Owner |
|---|---|---|
| `src/db/schema.ts`, `drizzle/` | All tables (Drizzle, `casing: snake_case`) | orchestrator (schema changes go through the orchestrator) |
| `src/db/index.ts`, `src/db/types.ts` | `db` (lazy proxy), `getDb/setDb/closeDb`, row types (`UserRow`, `JobRow`, ...) | orchestrator |
| `src/types/domain.ts` | Enums, JSON column shapes, **job input Zod schemas** (`createJobRequest`), DTOs, API error codes | orchestrator |
| `src/types/pack.ts` | Pack JSON format (`packSchema`) | packs |
| `src/providers/types.ts` | `ImageProvider`, `TrainingProvider`, `VideoProvider`, `ModerationProvider`, `FaceProvider`, `PaymentProvider`, `EmailProvider`, `StorageProvider` | orchestrator |
| `src/providers/registry.ts` | `getImageProvider()` … `getStorageProvider()`, `setProviderOverrides()` | providers |
| `src/lib/env.ts` | Validated env (`env.aiProvider`, `env.webhooksEnabled`, …) + safety invariant | orchestrator |
| `src/config/{app,credits,plans,models,rate-limits}.ts` | Branding, credit costs, plans/packs, model ids, rate limits | orchestrator (values tunable) |
| `src/server/http.ts` | `route({auth, rateLimit}, handler)`, `AppError`, `errors.*`, `parseBody`, `parseQuery` | orchestrator |
| `src/server/auth/session.ts` | `resolveRequestAuth`, `getCurrentUser`, `requireUserPage`, `requireAdminPage`, `authenticateApiKey` | auth |
| `src/server/rate-limit.ts` | `rateLimit(name, subject)`, `checkRateLimit`, `pruneRateLimits(olderThan?)` | platform-core |
| `src/server/credits/ledger.ts` | `applyCredit`, `debitForJob`, `refundJob(jobId, opts?, tx?)`, `getBalance`, `listLedger`, `grantCredits`, `adminAdjust` | platform-core |
| `src/server/storage/index.ts` | `getStorage()`, `signedUrl()`, `storageKeys.*` | storage |
| `src/server/images/process.ts` | `normalizeImage`, `makeThumbnail`, `imageMetrics`, `perceptualHash`, `applyAiLabel`, `applyWatermark`, `cropRegion`, `extractVideoFrames` | storage |
| `src/server/safety/index.ts` | `assertTextAllowed`, `checkOutputImage/Video`, `assertReferenceImageAllowed`, `verifyConsentSelfie`, `analyzeTrainingPhotoSafety`, `assertTrainingAllowed`, `assertModelsUsable`, `likenessScore`, `recordModerationEvent` | safety |
| `src/server/email/index.ts` | `sendEmail(template, to, props)` + template prop types | email |
| `src/server/packs/registry.ts` | `listPacks`, `listPackSummaries`, `getPack`, `renderPackPrompt`, `renderFreePrompt` | packs |
| `src/server/models/service.ts` | `getOwnedModel`, `identityRefFor`, `toModelDTO`, `deleteModelCompletely` | models |
| `src/server/media/service.ts` | `toMediaDTO`, `getOwnedMedia`, `getOwnedUpload`, `providerInputUrl`, `ingestImages`, `ingestVideos` | job-engine |
| `src/server/jobs/engine.ts` | `createJob`, `createBatch`, `toJobDTO`, `getJobForUser`, `syncJob`, `handleAIWebhook`, `cancelJob`, `pollStaleJobs`, `failJob` | job-engine |
| `src/server/jobs/handlers/types.ts` | `JobHandler` contract (`plan` → `submit` → `complete?` / `onFailed?`) | job-engine |
| `src/server/jobs/handlers/<type>.ts` | One handler per job type (stubs until implemented) | feature owner |
| `src/lib/api-client.ts` | `api<T>(path, {method, body})`, `ApiClientError`, SWR `fetcher` | orchestrator |

Stub bodies throw `not implemented (<owner>)`. Owners replace bodies **without changing signatures**.
If a signature must change, do it in a backward-compatible way (optional params) and note it in your report.

## 2. Conventions

- **TypeScript strict**, no `any` unless unavoidable (then `// eslint-disable-next-line` with a reason).
- **Server-only code** lives in `src/server/**` and `src/providers/**`. Never import them from client components.
- **Route handlers** always use `route()` from `src/server/http.ts`; validate bodies with Zod (`parseBody`).
  Params are a Promise in Next 16 — `route()` awaits them and passes `params`.
- **Errors**: throw `AppError`/`errors.*`; JSON shape `{ error: { code, message, details? } }`.
- **Authorization**: every query that touches user data filters by `userId` (no IDOR). Admin routes use `auth: "admin"`.
- **IDs**: `newId("prefix")` from `src/lib/ids.ts`. Tokens: `newToken()`; store only `sha256` hashes of secrets/tokens.
- **Money** in integer cents; **credits** are integers.
- **Dates** in DTOs are ISO strings.
- **Storage keys** only via `storageKeys.*` (everything for a user under `users/{userId}/`).
- **Model ids** only from `src/config/models.ts`.
- **Copy** user-facing strings via `t("key")` from `src/i18n` where practical (English shipped).
- **Tests**: Vitest unit tests next to the domain in `tests/unit/<area>/*.test.ts`; Playwright in `tests/e2e/`.
  Unit tests use in-memory PGlite (`tests/helpers/db.ts`), mock providers, and `vi.mock("@/server/auth/session")`.
- **Do not edit** `package.json`, lockfile, `src/db/schema.ts`, or other workstreams' files. Need a dep or schema
  change? Put it in your final report; the orchestrator applies it.

## 3. Job lifecycle (summary)

`POST /api/jobs` body = `createJobRequest` (discriminated by `type`):
`generate | pose_copy | edit | inpaint | upscale | face_restore | remove_background | video | talking_video | try_on | multi_person`.
`train` jobs are created by `POST /api/models/:id/train`. Batches by `POST /api/batches`.

1. `handler.plan()` — authorize every referenced resource (models via `getOwnedModel`/`assertModelsUsable`,
   media via `getOwnedMedia`, uploads via `getOwnedUpload`), resolve prompts, return `textsToModerate` + `data`.
2. Engine: `assertTextAllowed`, rate limits (`jobsPerMinute`, `jobsPerDay`, `draftsPerDay` for drafts),
   plan concurrency limit, `creditCost(input)`; in ONE transaction insert job + `debitForJob`.
3. `handler.submit()` → `ProviderJobRef`; job `running`. Submit error → `failJob` (refund).
4. Completion via `POST /api/webhooks/ai/[provider]` (verified), `GET /api/jobs/:id` (lazy sync if stale > 3s),
   `/api/cron/jobs` (Vercel cron) or `pnpm worker` (Docker).
5. Success → `handler.complete?()` or default `ingestImages`/`ingestVideos` (safety check per output; blocked outputs
   discarded + proportional refund; all blocked → status `blocked` + full refund). Failure → `failJob` + `onFailed`.

## 4. API routes

All JSON. `auth`: P = public, U = session, A = admin, K = API key, UK = session or API key.

### Auth / account
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| * | `/api/auth/[...all]` | P | Better Auth (magic link, Google OAuth, sessions) |
| GET | `/api/me` | U | → `{ user: MeDTO }` |
| PATCH | `/api/me` | U | `{ name?, marketingOptIn? }` → `{ user }` |
| POST | `/api/account/delete` | U | → `{ ok }` (emails confirmation link) |
| POST | `/api/account/delete/confirm` | P | `{ token }` → `{ ok }` (real deletion, final email) |
| GET | `/api/account/export` | U | → JSON export of the user's data |

### Identity models (consent, photos, training)
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/api/models` | UK | → `{ models: IdentityModelDTO[] }` (own + shared) |
| POST | `/api/models` | U | `{ name, subject }` → `{ model }` (status `awaiting_consent`) |
| GET | `/api/models/:id` | UK | → `{ model, photos: TrainingPhotoDTO[], readiness: ReadinessDTO, readinessByMode }` |
| PATCH | `/api/models/:id` | U | `{ name }` → `{ model }` |
| DELETE | `/api/models/:id` | U | → `{ ok }` (real deletion + email) |
| POST | `/api/models/:id/consent/challenge` | U | → `{ captureToken, expiresAt }` (single-use, 5 min) |
| POST | `/api/models/:id/consent` | U | multipart `selfie` (live camera capture) + `captureToken` → `{ model }` |
| POST | `/api/models/:id/photos` | U | multipart `file` → `{ photo, readiness, readinessByMode }` (quality + safety checked; safety failures are rejected with 422 and never stored) |
| DELETE | `/api/models/:id/photos/:photoId` | U | → `{ ok, model, readiness }` |
| POST | `/api/models/:id/train` | U | `{ mode: "instant" \| "trained" }` → `{ model, job: JobDTO \| null }` (instant: free, immediate) |

### Jobs / generation
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/jobs` | U | `CreateJobRequest` (+ header `Idempotency-Key`) → `{ job: JobDTO }` |
| GET | `/api/jobs` | U | `?status&type&limit&cursor` → `{ jobs: JobDTO[], nextCursor }` |
| GET | `/api/jobs/:id` | U | → `{ job: JobDTO }` (lazy provider sync) |
| POST | `/api/jobs/:id/cancel` | U | → `{ job }` |
| POST | `/api/batches` | U | `CreateBatchRequest` → `{ batch, jobs: JobDTO[] }` |
| GET | `/api/batches/:id` | U | → `{ batch, jobs: JobDTO[] }` |
| POST | `/api/prompt-helper` | U | `{ request, modelId?, style? }` → `{ prompt, negativePrompt?, suggestions? }` |
| POST | `/api/uploads` | U | multipart `file`, `purpose` (`reference`/`garment`/`mask`) → `{ upload: { id, url, width, height } }` |

### Gallery / sharing
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/api/media` | UK | `?folderId&favorite&kind&modelId&packId&batchId&showHidden&cursor&limit` → `{ media: MediaDTO[], nextCursor, hiddenCount? }` (hiddenCount on first page) |
| GET | `/api/media/:id` | UK | → `{ media }` |
| PATCH | `/api/media/:id` | U | `{ isFavorite?, folderId?, hidden? }` → `{ media }` |
| DELETE | `/api/media/:id` | U | → `{ ok }` (storage + row) |
| POST | `/api/media/bulk` | U | `{ action: favorite|unfavorite|move|delete|hide|unhide, ids, folderId? }` → `{ updated }` |
| POST | `/api/media/download` | U | JSON `{ ids }` or form `ids=a,b` → `application/zip` stream |
| GET/POST | `/api/folders` | U | list / `{ name }` create |
| PATCH/DELETE | `/api/folders/:id` | U | rename / delete (media kept) |
| POST | `/api/share` | U | `{ mediaId? , folderId? }` → `{ share: { id, token, url } }` |
| GET | `/api/share` | U | `?mediaId|folderId` → `{ shares }` |
| DELETE | `/api/share/:id` | U | revoke |
| POST | `/api/reports` | P (IP rate limit) | `{ shareToken?, mediaId?, reason, details?, email? }` → `{ ok }` |

### Packs
| GET | `/api/packs` | P | → `{ packs: PackSummary[] }` |
| GET | `/api/packs/:slug` | P | → `{ pack: PackSummary & { prompts: {title}[] } }` |

### Multi-person consent
| POST | `/api/multi-person/invites` | U | `{ email, message? }` → `{ invite }` (emails the owner) |
| GET | `/api/multi-person/invites` | U | → `{ sent: [...], received: [...] }` |
| POST | `/api/multi-person/invites/:token/accept` | U | `{ modelId }` → `{ ok }` (invitee picks which of their models to share) |
| POST | `/api/multi-person/invites/:token/decline` | U | → `{ ok }` |
| DELETE | `/api/multi-person/shares/:id` | U | revoke (either party) |

### Credits / billing
| GET | `/api/credits` | U | → `{ balance, ledger: CreditLedgerEntryDTO[], nextCursor }` |
| POST | `/api/billing/checkout` | U | `{ item: CheckoutItem }` → `{ url }` |
| POST | `/api/billing/portal` | U | → `{ url }` |
| GET | `/api/billing/subscription` | U | → `{ subscription | null, plan }` |
| POST | `/api/webhooks/payments/[provider]` | P (signature) | Stripe / mock events |
| POST | `/api/billing/mock/complete` | U (mock only) | `{ checkoutId }` → signs + posts a mock webhook (dev/e2e) |

### Teams / brand kits
| GET/POST | `/api/teams` | U | list mine / `{ name }` create (Studio plan) |
| GET/PATCH/DELETE | `/api/teams/:id` | U | team detail (members, kits) |
| POST | `/api/teams/:id/invites` | U | `{ email }` |
| POST | `/api/teams/invites/:token/accept` | U | join |
| DELETE | `/api/teams/:id/members/:memberId` | U | remove |
| PATCH | `/api/teams/:id/members/:memberId` | U | `{ role }` (owner only) |
| GET/POST | `/api/teams/:id/brand-kits` | U | list / create |
| PATCH/DELETE | `/api/brand-kits/:id` | U | update / delete |
| POST | `/api/teams/:id/credits/transfer` | U | `{ memberUserId, amount }` (owner → member) |

### API keys + public API v1
| GET/POST | `/api/api-keys` | U | list / `{ name }` → `{ key, apiKey }` (key shown once) |
| DELETE | `/api/api-keys/:id` | U | revoke |
| GET | `/api/v1/openapi.json` | P | OpenAPI 3.1 document |
| GET | `/api/v1/models`, `/api/v1/models/:id` | K | models |
| POST/GET | `/api/v1/jobs`, GET `/api/v1/jobs/:id`, POST `/api/v1/jobs/:id/cancel` | K | same bodies as `/api/jobs` |
| POST | `/api/v1/batches` | K | |
| GET | `/api/v1/media`, `/api/v1/media/:id` | K | |
| GET | `/api/v1/packs` | K | |
| GET | `/api/v1/credits` | K | |

### Webhooks / cron / files
| POST | `/api/webhooks/ai/[provider]` | P (signature) | fal / replicate / mock completion webhooks |
| GET | `/api/cron/jobs` | `Authorization: Bearer CRON_SECRET` | poll stale jobs |
| GET | `/api/cron/maintenance` | CRON_SECRET | low-credit emails, expire shares/invites/deletions, prune rate limits |
| GET/HEAD | `/api/files/[...key]` | signature (`?exp&sig&dl`) | local storage driver file serving (Range supported) |

### Admin (auth A)
`GET /api/admin/stats`, `GET /api/admin/users?q`, `GET /api/admin/users/:id`,
`POST /api/admin/users/:id/credits {delta, note}`, `POST /api/admin/users/:id/suspend {reason}`,
`POST /api/admin/users/:id/unsuspend`, `GET /api/admin/jobs?status&type`, `POST /api/admin/jobs/:id/refund`,
`GET /api/admin/moderation`, `POST /api/admin/reports/:id/resolve {action: dismiss|remove_media|suspend_user, note}`.

### Dev (mock mode only)
`GET /dev/emails` (page) — mailbox of mocked emails; `POST /api/demo/login` (DEMO_MODE).

## 5. Page map

Marketing (static, fast): `/`, `/pricing`, `/packs`, `/packs/[slug]`, `/faq`, `/legal/terms`, `/legal/privacy`,
`/legal/acceptable-use`, `/docs/api`, `/s/[token]` (shared media + report button), `/login`, `/verify` (magic-link landing: user clicks to consume the token, so link scanners can't burn it),
`/invites/[token]` (multi-person), `/teams/join/[token]`, `/account/delete/confirm`, `/suspended`.

App (`/app/**`, signed in): `/app` (dashboard), `/app/models`, `/app/models/new` (wizard: name → consent selfie →
upload → quality check → train), `/app/models/[id]`, `/app/create` (prompt / pack / reference, drafts, prompt helper),
`/app/packs`, `/app/packs/[slug]` (batch), `/app/batches/[id]`, `/app/edit/[mediaId]` (edit / brush / upscale / bg),
`/app/pose`, `/app/video`, `/app/try-on`, `/app/together` (multi-person), `/app/gallery`, `/app/gallery/[mediaId]`,
`/app/billing`, `/app/settings` (profile, delete account, export), `/app/api-keys`, `/app/team`.

Admin (`/admin/**`, role admin): `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/jobs`, `/admin/moderation`,
`/admin/revenue`.

## 6. Design system

Tailwind v4 + shadcn-style components in `src/components/ui/*` (Radix via the `radix-ui` package, `cn()` from
`src/lib/utils.ts`, CSS variables in `src/app/globals.css`, light + dark). Tokens: `--background`, `--foreground`,
`--primary` (brand), `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, `--radius`; brand gradient
utility `.bg-brand-gradient`. Base set: button, card, input, label, textarea, dialog, alert-dialog, dropdown-menu,
select, tabs, badge, progress, separator, sheet, skeleton, switch, tooltip, avatar, checkbox, slider, sonner
(toaster), table, alert, scroll-area, popover, accordion, radio-group, toggle-group.
Shared app components in `src/components/app/*`: `PageHeader`, `EmptyState`, `CreditBadge`, `ImageDropzone`
(client-side resize to ≤2048px JPEG, multipart upload), `useJob(jobId)` / `useJobs(ids)` hooks (SWR polling until
terminal), `JobProgress`, `MediaGrid`, `MediaCard`, `ModelPicker`, `PackCard`, `AspectRatioPicker`, `CostHint`.
Layouts: `src/app/(marketing)/layout.tsx` (header/footer), `src/app/app/layout.tsx` (sidebar desktop, bottom
nav mobile), `src/app/admin/layout.tsx`.
