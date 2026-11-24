# Performance review — OpenShoot

Independent, report-only review (static analysis + the existing `.next/` production build output).
No `next build/dev/start` was run and no Lighthouse run was possible, so Lighthouse scores below are
**estimates**; byte counts are **measured** from build `JjGl638cFWFhh10lmjVxW` (identical, content-hashed
chunks to the earlier `RijM3Hje_aQPS6yPr4k4x` build). gzip sizes are `gzip -9`; brotli on a CDN is ~15% smaller.

## TL;DR

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| PERF-1 | Signed URLs change on every request → no browser caching; every poll re-downloads all thumbnails | High | S |
| PERF-2 | PostHog loads 123 KB gz / 370 KB raw at idle on the landing page | High (Lighthouse, when key set) | S |
| PERF-3 | Image optimizer open to any `https://**` host | High (cost/abuse) | XS |
| PERF-4 | ~45 KB gz of avoidable client JS on `/` (Radix Dialog, SWR, next/image, Button stack, eager Toaster) | Medium | S |
| PERF-5 | `outputFileTracingIncludes: "/**"` puts ffmpeg (76 MB) + safety models in all 137 functions; ~175 MB per function | High (risk) | S |
| PERF-6 | Polling amplification: batch/job/model polls re-sign everything and drive provider status calls per viewer | High | M |
| PERF-7 | Missing FK / time / status indexes → seq scans on delete paths, cron and admin | Medium-High | S |
| PERF-8 | Keyset pagination on `date_trunc(created_at)` defeats `(user_id, created_at)` index | Medium | S |
| PERF-9 | Output ingestion (downloads, tfjs, sharp, ffmpeg) runs inside user GET polls / 60 s functions; tfjs blocks the event loop | High | L |
| PERF-10 | Redundant image/video work per output (2× mozjpeg, ~6 decodes, 3× ffmpeg probe) | Medium | M |
| PERF-11 | Zod (32 KB gz) shipped to 14 `/app` routes via `src/types/domain.ts` | Medium | S |
| PERF-12..18 | N+1 model counts, ZIP64, input re-uploads, DB client, prunes, CSS/paint/fonts, misc | Low-Medium | XS-S |

**Landing page JS (`/`)**: **~195 KB gz / 620 KB raw** blocking-path JS (15 async scripts), of which
~132 KB gz is the Next/React framework floor; +9.7 KB gz Sonner right after hydration; +123 KB gz PostHog at idle
when `NEXT_PUBLIC_POSTHOG_KEY` is set. Estimated mobile Lighthouse: **~88–95 without PostHog, ~75–88 with it**.

---

## 1. Landing page (`/`) — Lighthouse mobile readiness

### What ships (measured from `.next/server/app/index.html` + `(marketing)/page_client-reference-manifest.js`)

`/` is fully prerendered (`index.html`, `x-nextjs-prerender: 1`), `proxy.ts` only matches `/app` and `/admin`,
so TTFB is a static/CDN hit. No `<img>` and no third-party scripts unless PostHog is configured.

| Chunk | raw | gz | Source |
|---|---:|---:|---|
| `1s5zxn30ty-dr.js` | 234.4 KB | 73.1 KB | react-dom client (framework) |
| `2vuzl7694ohwt.js` | 165.9 KB | 45.3 KB | Next App Router runtime (framework) |
| `2u-h8vvyjucfj.js` | 33.3 KB | 8.9 KB | React core (framework) |
| `turbopack-077hmtqrhcoji.js` | 11.2 KB | 4.4 KB | Turbopack runtime |
| `42kl8c897prly.js` | 14.1 KB | 3.6 KB | Next client components (layout-router, boundaries, icon-mark) |
| `18ml6z8w2u-jt.js` | 17.7 KB | 7.2 KB | root `Providers`: next-themes, `I18nProvider` + the full `en` dictionary, PostHog stub |
| `15vcwpb82prg-.js` | 13.1 KB | 5.8 KB | **SWR** (`SWRConfig` in root providers) — unused on marketing pages |
| `14jrkgcq_744-.js` | 18.3 KB | 7.3 KB | root `app/error.tsx`: Radix `Slot`/compose-refs, `Button`, lucide icon |
| `2al8qq9h3ai0o.js` | 29.1 KB | 8.9 KB | clsx + **tailwind-merge** + cva (`cn` in `Button`) |
| `1nj0ip4qx1i1m.js` | 16.0 KB | 5.7 KB | `MarketingMobileNav` + `ThemeToggle` + `APP` config + react-remove-scroll |
| `3qk5d5e4ldr1f.js` | 23.7 KB | 8.9 KB | **Radix primitives** (presence/portal/controllable state) for the Sheet |
| `2u1a7xl277e0n.js` | 25.9 KB | 9.1 KB | **Radix Dialog** (FocusScope, DismissableLayer, aria-hidden) for the Sheet |
| `3uwonsgxpbzpf.js` | 15.0 KB | 5.7 KB | **`next/image`** client (from `PackCard`) — dead: 0 of 64 packs has a `cover` |
| `1bi2ss7mactfz.js` | 2.1 KB | 1.0 KB | `app/global-error.tsx` |
| `38529eqmmue3w.js` | 0.4 KB | 0.3 KB | bootstrap (low-priority preload) |
| **Total** | **620 KB** | **195 KB** | ~132 KB gz framework floor (= `/_global-error` route) + ~63 KB gz app |
| `3z0z-394zf6lo.js` (after hydration) | 35.7 KB | 9.7 KB | Sonner `Toaster` (`next/dynamic`, `ssr:false`) — loads on every page |
| `2mjox66frebdc.js` (idle, if key set) | 369.9 KB | 123.0 KB | `posthog-js` full module |
| `0cz1d0mv5g_q7.js` | 112.6 KB | 39.4 KB | `nomodule` polyfills (not fetched by modern browsers) |

Other resources:

- **CSS** (render-blocking, 2 requests): `3hdxkciod_b_j.css` 125.4 KB raw / 21.4 KB gz — the whole app's Tailwind
  utilities (~1,450 selectors, all genuinely used somewhere in `src/`, most not on `/`); `2bj61ltz6nho2.css`
  5.3 KB / 1.2 KB gz (`@font-face`). Lighthouse will flag ~90–100 KB raw as unused CSS.
- **Fonts**: 3 preloaded woff2 = 60 KB (Geist variable 29 KB, Instrument Serif regular 15 KB + italic 15.7 KB, all
  `display: swap` with next/font size-adjusted fallbacks). Geist Mono is `preload: false` but is used above the fold
  (hero contact-sheet labels/scores, `font-mono`), so it is discovered late and swaps a few small labels.
- **HTML**: 246.8 KB raw / 33.5 KB gz; 141.6 KB of it is inline RSC flight data (normal duplication).
- **LCP element**: the hero `<h1>` text (Instrument Serif, 52 px, 2–3 lines on a 412 px viewport). There are no
  LCP-eligible images (portrait art is inline SVG/gradients), so LCP ≈ FCP once the CSS arrives.
- **CLS**: low. Fonts use metric-adjusted fallbacks, pack tiles reserve `aspect-[4/5]`, Toaster is fixed-position,
  theme toggle renders both icons. No late-inserted banners.
- **Third-party**: none unless PostHog is enabled (PERF-2). JSON-LD is inline.

**Verdict (estimate):** the structure is right (static, no images, small CSS, async scripts) and 90+ on mobile is
reachable. The main risks are TBT from ~620 KB raw JS evaluation plus hydration on a 4× throttled CPU
(~150–300 ms estimated) and PostHog. PERF-2 and PERF-4 together take ~170 KB gz off what a cold mobile visit
executes.

---

## 2. Findings (quick wins first)

### PERF-1 — Signed URLs are non-deterministic → zero browser caching; polls re-download every image (High, S)

- **Where**: `src/providers/storage/local.ts:183` (`exp = Math.floor(Date.now()/1000) + ttl`),
  `src/providers/storage/s3.ts:131-140` (SigV4 presign stamped with the current second),
  `src/server/media/service.ts:65-70` (3 signatures per media: url, thumb, download),
  `src/server/models/photos.ts:27-31`, `src/server/models/service.ts:85`, `src/server/gallery/share.ts:172-176`.
- **Evidence**: every response carries new URLs for the same objects, so the browser cache key changes each time.
  `use-gallery.ts:253-256` already works around this ("fresh pages would carry new signed URLs and make every
  thumbnail reload"), but the polling paths don't:
  - `useBatch` (`src/hooks/use-job.ts:121-130`) polls `/api/batches/:id` every **1.5 s** and
    `batch-progress.tsx` renders `job.media[*].thumbUrl` → every completed thumbnail is re-requested every 1.5 s
    while the batch runs (estimate: a 40-shot pack with 30 done ≈ 1,200 thumbnail requests/min per viewer).
  - `useModel` (`src/components/models/use-model.ts:16`) polls every **5 s for the whole training run** (~20 min);
    each response re-signs 10–30 training photos → `TrainingPhotoGrid` reloads them all every 5 s.
  - Objects are uploaded without `Cache-Control` (`ingestImages` → `storage.put(..., { contentType })`), so even a
    stable S3 URL would only get heuristic caching.
- **Fix**: sign against a time bucket so URLs are stable for an hour:
  - local: `const exp = (Math.floor(nowSec / 3600) + 2) * 3600;` (valid 1–2 h, identical within the hour).
  - S3: `getSignedUrl(client, cmd, { expiresIn: 7200, signingDate: new Date(Math.floor(Date.now()/3_600_000)*3_600_000) })`
    and add `ResponseCacheControl: "private, max-age=3600, immutable"` (keys are immutable: ids are never reused).
  - Mint `downloadUrl` lazily (or only in the viewer) — it is a third presign per item for a button most items never use.

### PERF-2 — PostHog adds 123 KB gz / 370 KB raw of main-thread work right after load (High when enabled, S)

- **Where**: `src/components/providers/posthog-provider.tsx:11-29` (`import("posthog-js")` on `requestIdleCallback`).
- **Evidence**: chunk `2mjox66frebdc.js` = 369,893 B raw / 122,976 B gz (posthog-js 1.454.2 `dist/module.mjs`).
  An idle callback fires within a second of load, i.e. inside Lighthouse's TBT/TTI window, so the parse/eval
  long task counts (estimate: +250–500 ms main thread on 4× throttling). Lazy loading keeps it off the critical
  path but not off the main thread.
- **Fix**: import the slim build (`posthog-js/dist/module.slim`: 164,647 B raw / 55,833 B gz in this
  version; check that the features you use are included), and start it on first interaction (`pointerdown`/`keydown`/`scroll`)
  or `setTimeout(…, 5–10 s)` on marketing routes. Alternatively, keep `/` analytics server-side (pageview via
  a route handler) and load the client SDK only inside `/app`.

### PERF-3 — Open image optimizer (`hostname: "**"`) (High cost/abuse risk, XS)

- **Where**: `next.config.ts:48-53` — `images: { unoptimized: false, remotePatterns: [{ protocol: "https", hostname: "**" }] }`.
- **Evidence**: the only `next/image` user is `PackCard` (local pack covers, none exist today); all private media
  correctly use `<img>`. As configured, `/_next/image?url=https://anything&w=3840&q=100` lets anyone use the
  deployment as a free resizing proxy (sharp CPU on self-host; per-image billing on Vercel).
- **Fix**: `images: { unoptimized: true }` (and drop `next/image` from `PackCard`, see PERF-4), or
  `remotePatterns: []` plus `localPatterns` limited to `/packs/**`.

### PERF-4 — Trim ~45 KB gz of avoidable client JS on marketing pages (Medium, S)

- **Where / Evidence** (chunk table above):
  - `src/components/layout/marketing-mobile-nav.tsx:7` imports `Sheet` (Radix Dialog) eagerly → `3qk5…` + `2u1a…` +
    part of `1nj0…` ≈ **18–20 KB gz**, used only after a tap on the hamburger.
  - `src/components/providers/index.tsx:5,23` mounts `SWRConfig` at the root → **5.8 KB gz** of SWR on every
    marketing/auth page.
  - `src/components/app/pack-card.tsx:1,40` imports `next/image` → **5.7 KB gz**; 0/64 packs have `cover`.
  - `src/app/error.tsx:7` (root boundary, always loaded) and `ThemeToggle` use `Button` → Radix `Slot` +
    tailwind-merge/cva ≈ **16 KB gz** (`14jrk…` + `2al8…`).
  - `src/components/providers/index.tsx:13` — `dynamic(..., { ssr:false })` Toaster still downloads **9.7 KB gz**
    on every page right after hydration.
- **Fix**: render the hamburger as a plain `<button>` and `next/dynamic`-load the Sheet on first click (or a CSS-only
  `<details>` menu); move `SWRConfig` into `app/app/layout.tsx` / `app/admin/layout.tsx` (and any other SWR users);
  render pack covers with a plain `<img loading="lazy" decoding="async">` (static files) or drop the cover branch;
  give `error.tsx`/`ThemeToggle` static class strings instead of `Button`/`cn`; mount the Toaster on the first
  `toast()` call (tiny proxy module) or only in `/app`. Expected `/` ≈ 150 KB gz (−23%), app-specific JS
  ~63 → ~18 KB gz.

### PERF-5 — Serverless function size: ffmpeg + models in every function, duplicate libvips, PGlite (High risk, S)

- **Where**: `next.config.ts:36-48` (`outputFileTracingIncludes: { "/**": [ffmpeg, safety models, packs, drizzle] }`),
  `src/db/index.ts:9` (static `import { PGlite }`), `Dockerfile:85,109` (standalone + `/tools` copies).
- **Measured from the `.nft.json` traces** (137 traced routes):

  | Package (union of all traces) | Size |
  |---|---:|
  | `ffmpeg-static` | 76.2 MB |
  | `@electric-sql/pglite` | 19.8 MB |
  | `@img/sharp-libvips-linuxmusl-x64` | 18.0 MB |
  | `@img/sharp-libvips-linux-x64` | 17.8 MB |
  | `.next/server/chunks` (js) | 15.5 MB |
  | `next` | 14.8 MB |
  | `@vladmandic/human` models | 9.1 MB |
  | `nsfwjs` model | 5.6 MB |
  | tfjs core/converter/wasm | 3.8 MB |
  | **node_modules union** | **170 MB** (4,198 files) |

  - Smallest function (`favicon.ico`, `icon.svg`, `_global-error`): **96.9 MB**, of which 76 MB is ffmpeg and ~17 MB safety models.
  - Typical page function: **163 MB**; with the `next-server` trace (50 MB, both libvips variants): **~175 MB**.
    That leaves ~75 MB of headroom under Vercel's 250 MB uncompressed limit. One more native dependency, or a
    transitive pull of the `@tensorflow/tfjs` umbrella (147 MB per the comment in `local-moderation.ts`), breaks deploys.
  - `.next/server` is 126.5 MB, including **58.5 MB of server source maps** and 16.7 MB of `.nft.json`. That plus the 170 MB
    of node_modules explains the ~256 MB standalone.
  - Docker: the runtime sets `FFMPEG_BIN=/tools/node_modules/ffmpeg-static/ffmpeg` (`Dockerfile:85`), so the 76 MB ffmpeg
    copy inside `/app` standalone is dead weight. The image also carries both libvips variants twice (glibc image, `bookworm-slim`).
- **Fix**:
  - Scope the includes: ffmpeg + models only for routes that moderate/ingest (`/api/jobs/**`, `/api/batches/**`,
    `/api/v1/jobs/**`, `/api/v1/batches/**`, `/api/webhooks/ai/**`, `/api/cron/jobs`, `/api/uploads`,
    `/api/models/**`, `/api/multi-person/**`, plus the server-action pages that upload). Keep `packs/**` and `drizzle/**` where needed.
  - `outputFileTracingExcludes: { "/**": ["**/@img/sharp-libvips-linuxmusl-*/**", "**/@img/sharp-linuxmusl-*/**"] }`
    (or pnpm `supportedArchitectures: { libc: ["glibc"] }`) → −18 MB per function.
  - Load PGlite with `await import()` only for `pglite:` URLs and exclude `@electric-sql/pglite` from traces in
    production builds → −20 MB from every DB-touching function, and less cold-start module evaluation.
  - Set `experimental.serverSourceMaps: false` for production (or `find .next/standalone -name '*.map' -delete` in the Docker
    builder). Exclude `ffmpeg-static/ffmpeg` from the standalone in Docker builds.

### PERF-6 — Polling amplification: per-viewer provider calls, full re-signing, N requests per tick (High, M)

- **Where**: `src/hooks/job-status.ts:4` (1.5 s for every job type), `src/hooks/use-job.ts:89-106`
  (`useJobs` = one `GET /api/jobs/:id` per id per tick), `src/app/api/batches/[id]/route.ts:10-21`,
  `src/server/jobs/api.ts:11,37-48` (`MAX_LAZY_SYNC = 10`), `src/server/jobs/engine.ts:60,418-457` (`SYNC_MIN_INTERVAL_SEC = 3`).
- **Evidence**:
  - Each `GET /api/jobs/:id` costs ~5 queries (user row, job select, conditional `UPDATE … last_polled_at`, reload,
    media select) plus a provider `getStatus` every 3 s while a user watches. Replicate grouped predictions make
    k calls per sync (`replicate.ts:87-94`). Provider polling therefore scales with **viewers × running jobs**, even though
    webhooks are configured (`fal.ts:84`, `replicate.ts:88-90`).
  - `GET /api/batches/:id` returns **all** jobs (including `input` JSON) and **all** finished media with 3 fresh presigns
    each, every 1.5 s. It also syncs up to 10 running jobs (concurrency 4). Estimate for a 40-job batch: ~60 KB JSON per poll,
    ~2.4 MB/min per viewer, plus the PERF-1 image reloads.
  - `useJobs` ignores the existing `GET /api/jobs?ids=a,b,c` (`src/server/jobs/queries.ts:141-145`).
  - The 1.5 s cadence also applies to `train` (~20 min) and video jobs (minutes).
- **Fix**: use `?ids=` for `useJobs`. Make the batch endpoint incremental (`?since=<updatedAt>` → only changed
  jobs; the client merges). Back off client polling by age/type (1.5 s for the first 15 s → 5 s → 15 s; `train`: 15–30 s).
  When webhooks are configured, raise `SYNC_MIN_INTERVAL_SEC` to ~20–30 s and let the cron/worker be the fallback.
  Pause polling when `document.hidden` (`refreshWhenHidden` is off by default in SWR; verify nothing overrides it).

### PERF-7 — Missing indexes for the actual query and FK patterns (Medium-High, S)

Indexes are compared against `drizzle/0000_init.sql` / `src/db/schema.ts`.

- **FK columns without an index**: Postgres does a full scan of the referencing table for each parent row deleted or updated:
  - `share_links.media_id` (ON DELETE CASCADE) and `reports.media_id` (SET NULL): `deleteMediaRows`
    (`src/server/gallery/media.ts:195-215`) deleting 200 media runs **200 seq scans of `share_links` and `reports`** (per-row RI trigger).
  - `media.model_id`, `jobs.model_id` (SET NULL): deleting one model (`deleteModelCompletely`) scans **the two largest
    tables in full**, for all users.
  - `consent_records.model_id`, `model_shares.model_id` (CASCADE); `share_links.folder_id` (CASCADE, folder delete);
    `reports.share_link_id/target_user_id/reporter_user_id` (SET NULL, user/share deletion); `training_photos.user_id`.
- **Query patterns**:
  - `repairStaleBatches` (`src/server/jobs/batches.ts:74-87`) filters `batches.status = 'running'` with no status
    index. It runs on **every cron tick (1/min) and every 5 s in the worker** (`scripts/worker.ts`), and is a seq scan that grows with history.
  - Viewer children (`src/server/gallery/viewer.ts:51-62`, `media.parent_media_id`): no index, so it scans all of the user's media.
  - `assertConcurrency` (`engine.ts:135-150`): `status IN (queued,running)` per user walks all of the user's jobs.
  - Admin: `getStats` (`src/server/admin/stats.ts:244-252,311`) and the admin job list order or filter on
    `jobs.created_at`, `credit_ledger.created_at` and `payments.created_at` without a leading-`user_id` predicate,
    so these are seq scans. `moderation_events.reviewed = false` (`admin/moderation.ts:103`, `stats.ts:319`) has no index.
- **Fix** (new migration; Drizzle `.where(sql\`…\`)` for partials):
  ```sql
  CREATE INDEX share_links_media_idx ON share_links (media_id) WHERE media_id IS NOT NULL;
  CREATE INDEX share_links_folder_idx ON share_links (folder_id) WHERE folder_id IS NOT NULL;
  CREATE INDEX reports_media_idx ON reports (media_id) WHERE media_id IS NOT NULL;
  CREATE INDEX reports_target_user_idx ON reports (target_user_id);
  CREATE INDEX media_model_idx ON media (model_id) WHERE model_id IS NOT NULL;
  CREATE INDEX media_parent_idx ON media (parent_media_id) WHERE parent_media_id IS NOT NULL;
  CREATE INDEX jobs_model_idx ON jobs (model_id) WHERE model_id IS NOT NULL;
  CREATE INDEX jobs_active_idx ON jobs (user_id) WHERE status IN ('queued','running');
  CREATE INDEX jobs_created_idx ON jobs (created_at DESC, id DESC);
  CREATE INDEX consent_records_model_idx ON consent_records (model_id);
  CREATE INDEX model_shares_model_idx ON model_shares (model_id);
  CREATE INDEX batches_running_idx ON batches (updated_at) WHERE status = 'running';
  CREATE INDEX credit_ledger_created_idx ON credit_ledger (created_at);
  CREATE INDEX payments_created_idx ON payments (created_at);
  CREATE INDEX moderation_events_unreviewed_idx ON moderation_events (created_at DESC) WHERE reviewed = false;
  ```
  `jobs_status_idx (status)` could also become partial (`WHERE status IN ('queued','running')`), because the cron only reads those.

### PERF-8 — Keyset pagination on `date_trunc('milliseconds', created_at)` can't use the index (Medium, S)

- **Where**: `src/server/gallery/media.ts:85,99-106,119-124,136-157`; `src/server/jobs/queries.ts:161-178`.
- **Evidence**: `ORDER BY date_trunc('milliseconds', created_at) DESC, id DESC` and the cursor predicate on the same
  expression don't match `media_user_idx (user_id, created_at)` / `jobs_user_idx`. Every page (and both viewer
  prev/next queries) fetches **all of the user's visible rows** and top-N sorts them, so cost grows linearly with the
  user's history instead of staying O(page). The first gallery page also runs a separate `count(*)` over the same set.
- **Fix**: make ordering match the index: either `timestamp(3)` columns (ms precision at insert, no truncation needed),
  or encode the cursor with full µs precision (`created_at::text`) and order by `created_at DESC, id DESC`. Alternatively
  add expression indexes `(user_id, date_trunc('milliseconds', created_at) DESC, id DESC)`. Consider caching
  `hiddenCount`, or computing it only when the "show hidden" UI is visible.

### PERF-9 — Heavy ingestion runs inside request handlers; tfjs blocks the event loop (High, L)

- **Where**: `GET /api/jobs/[id]` → `getJobForUser(…, {sync:true})` (`engine.ts:418-432`) → `syncJob` →
  `completeJob` (`engine.ts:544-…`) → `ingestImages`/`ingestVideos` (`src/server/media/service.ts:194-360`).
  The same path runs from `/api/batches/[id]` (up to 4 jobs in parallel), webhooks (`maxDuration 60`) and cron (`maxDuration 60`, 50 jobs).
  `src/providers/safety/tf-runtime.ts:114-121` (process-wide `runExclusive` queue), `local-face.ts:52` (`async: false`).
- **Evidence**:
  - Per image, strictly sequential: provider download → NSFW classify → face detect + embed (likeness) →
    `imageMetrics` → watermark (mozjpeg) → AI label (mozjpeg) → thumbnail → 2 storage PUTs. Estimate: ~2–4 s per
    image, so 10–15 s for a 4-image job, paid by whichever user poll happens to observe completion.
  - Videos: 100 MB download cap held in memory, moderation frame extraction, `finalizeVideo` re-encode with a
    **5 min** ffmpeg timeout (`video.ts:17`) under a **60 s** cron/webhook `maxDuration`. The function can be killed
    mid-ingest, which leaves the finalize lease for 300 s and redoes the work (`FINALIZE_LEASE_SEC`).
  - tfjs-wasm inference is synchronous JS/wasm on the main thread, serialized process-wide. On a Node server or
    Vercel Fluid (shared instances), every concurrent request on that instance stalls for each inference
    (~100–500 ms per image, estimate). The model warmups (`warmupLocalModerationProvider`,
    `warmupLocalFaceProvider`) are never called, so the first ingest per instance also pays model init.
- **Fix**: on poll/webhook, only record `providerStatus=succeeded` and hand off ingestion: `after()` from
  `next/server` for short jobs, the worker for self-host, or a dedicated route with `maxDuration ≥ 300` for videos.
  Within ingest, run downloads/uploads with `mapLimit(3–4)`. Move tfjs inference to `worker_threads` (e.g. piscina)
  so the event loop stays free. Call the warmups at worker start (and in `instrumentation.ts` for long-lived servers).

### PERF-10 — Redundant image/video processing per output (Medium, M)

- **Where**: `src/server/images/process.ts:189-201` (`applyAiLabel`: `metadata()` + `hasTransparency` + mozjpeg
  q92 re-encode), `:252-261` (`applyWatermark`: decode + mozjpeg q92 re-encode), `:76-80` (thumbnail decode),
  `:119` (`imageMetrics` decode); NSFW and face models each decode again (`image-decode.ts`).
  `src/server/images/video.ts:109-232` + `service.ts:322-331` + `safety/outputs.ts:38`.
- **Evidence**: free-tier images are JPEG-encoded **twice with mozjpeg** (≈3–5× slower than libjpeg-turbo) with
  generational loss, and decoded ~6 times. Each video is written to tmp and probed **3 times** (moderation frames,
  finalize, thumbnail frame), and frame extraction spawns one ffmpeg per frame.
- **Fix**: decode once to raw RGB and share it between metrics, NSFW, face and thumbnail. Do watermark + XMP + encode in one
  sharp pipeline (`composite().withXmp().jpeg({quality: 90})` without mozjpeg for outputs). For video, reuse the
  probe/frames from moderation, take the thumbnail from the finalize pass (`-frames:v 1` second output), and extract
  frames with one `fps=`/`select=` invocation.

### PERF-11 — Zod v4 shipped to 14 `/app` routes (Medium, S)

- **Where**: `src/types/domain.ts:6,191-…` defines zod schemas next to runtime constants that client code imports
  (`hooks/job-status.ts:2` `TERMINAL_JOB_STATUSES`, `components/app/aspect-ratio-picker.tsx:7`, `job-progress.tsx:9`,
  `edit/edit-panel.tsx:12`, `enhance/enhance-ui.ts:9`, `create/logic.ts:23`).
- **Evidence**: client chunk `1f71o-9z5snqt.js` = 111.9 KB raw / **31.8 KB gz** of zod, referenced by `/app/create`,
  `/app/edit/[mediaId]`, `/app/models/*`, `/app/packs/*`, `/app/gallery/[mediaId]`, `/app/try-on`, `/app/video`, etc.
  `/app/create` first-load is ~308 KB gz.
- **Fix**: move constants and `type`s into a zod-free `src/types/constants.ts`; keep schemas in `src/types/schemas.ts`
  (server only). Use `zod/mini` if the client really needs validation.

### PERF-12 — N+1 in model lists (Low-Medium, S)

- **Where**: `src/server/models/detail.ts:31-34` → `toModelDTO` per model (`src/server/models/service.ts:72-86`):
  a `count(*)` on `training_photos` + an owner `select` (shared models) + a presign, per model.
- **Evidence**: 1 + N…2N queries for `/api/models` and every model picker; `use-models` revalidates on focus. N is bounded by
  `plan.limits.maxModels` + shares, so this is small but avoidable.
- **Fix**: one grouped query: `select model_id, count(*), count(*) filter (where status='accepted') … where model_id in (…) group by model_id`,
  plus one owner-name query for shared rows.

### PERF-13 — Streaming ZIP: correct backpressure, but no ZIP64 and whole-object buffering (Low-Medium, S)

- **Where**: `src/server/gallery/zip.ts:41-108`, `src/app/api/media/download/route.ts:6`.
- **Evidence**: pull-based `ReadableStream` with one file in flight is correct and keeps memory at about one object.
  However, fflate 0.8 writes no ZIP64 (its README says "Supports files up to 4GB ❌"), so an archive over 4 GiB
  (e.g. 200 selected videos, the `MAX_BULK_IDS` cap) is silently corrupt. `storage.get` buffers whole objects
  (`transformToByteArray`), and `maxDuration = 300` can truncate very large archives mid-stream.
- **Fix**: sum `media.bytes` before streaming and reject or split above ~3.5 GB. Stream S3 bodies chunk-wise into
  `ZipPassThrough.push(chunk, last)`.

### PERF-14 — Provider input re-uploaded per job on non-public storage (Low-Medium, S)

- **Where**: `src/server/media/service.ts:119-125` (`providerInputUrl` → `uploadInput` when `!publiclyReachable`),
  `src/server/models/service.ts:38-62` (`identityRefFor`: 4 reference photos per instant-mode job).
- **Evidence**: with the local driver, a 40-job instant-mode pack batch (`createBatch`, `engine.ts:362-385`)
  uploads 4 × 40 = 160 copies of the same photos to fal/replicate storage, inside the `POST /api/batches` request.
- **Fix**: memoize `providerInputUrl` per `storageKey` (LRU, TTL below the provider's input lifecycle), or resolve
  `identityRefFor` once per batch and pass it to each child job.

### PERF-15 — DB client: PGlite eager import, no prod guard, pool sizing (Low-Medium, S)

- **Where**: `src/db/index.ts:9,30-33,43`; `src/lib/env.ts:43`.
- **Evidence**: PGlite is imported (and traced, 19.8 MB) in every function even on Postgres deployments. If
  `DATABASE_URL` is unset in production, the app silently uses `pglite:./.data/pglite`: on Vercel that is a read-only
  filesystem, and on a self-host it is a single in-process connection that serializes all queries. The `Promise.all`
  query fan-outs (admin stats 7×, viewer 6×) would run one at a time. `max: 10` connections per instance multiplies
  under Fluid/serverless scale-out.
- **Fix**: dynamic-import PGlite only for `pglite:` URLs. Fail fast in production on a `pglite:` URL unless it is
  explicitly allowed. Document a pooled URL (Supavisor/Neon pooler/pgbouncer) and `DATABASE_POOL_MAX=3–5` for Vercel.

### PERF-16 — Maintenance prunes load every deleted key into memory (Low, XS)

- **Where**: `src/server/maintenance/index.ts:49-62`, `src/server/rate-limit.ts:77-83`.
- **Evidence**: `DELETE … RETURNING key` only to count rows. `rate_limits` gets a row per (limit, subject, window)
  (`jobsPerMinute` alone writes up to 1,440 windows/user/day), so the daily prune can return 10⁵–10⁶ rows to Node within a
  60 s function. `window_start`-only predicates can't use the `(key, window_start)` PK, so it is a seq scan. The same applies
  to `email_outbox.created_at` (index is `(to, created_at)`).
- **Fix**: use the driver's affected-row count (or `WITH d AS (DELETE … RETURNING 1) SELECT count(*) FROM d`). Add
  `rate_limits (window_start)` and `email_outbox (created_at)` indexes, or delete in bounded batches.

### PERF-17 — Landing CSS, paint and fonts (Low, S)

- **CSS**: one 125 KB raw / 21 KB gz render-blocking file for the whole app. `experimental.inlineCss` removes the round trip
  but duplicates CSS into HTML+RSC on every navigation. Measure before adopting. Otherwise accept it; the gzip cost is small.
- **Paint** (`src/app/globals.css:198-220,233`, `src/components/marketing/hero.tsx:41-45`):
  - a 960×544 px `blur-3xl` glow layer;
  - `.grain` (SVG `feTurbulence` background plus `mix-blend-mode: overlay`) on the hero, 6 tiles and 8 pack cards;
  - a `backdrop-filter: blur(16px) saturate(1.4)` sticky header;
  - `text-rendering: optimizeLegibility` on `html`.

  None of these is a Lighthouse audit, but they add raster/composite cost on low-end Android, which affects LCP render
  delay and scroll smoothness. Prefer a tiny pre-rendered noise PNG without blend modes, a smaller pre-blurred gradient, and
  `text-rendering: auto` for body text.
- **Fonts**: Geist Mono (`layout.tsx:12`, `preload:false`) renders above the fold in the hero labels. Either use the sans
  font there or accept a late swap of ~10 small labels. The Instrument Serif italic preload is justified (it is in the LCP `<h1>`).

### PERF-18 — Misc (Low)

- `src/app/s/[token]/page.tsx:117` awaits `incrementShareViews` (a write) before rendering the public share page; use `after()`.
- `route({ auth: "public" })` (`src/server/http.ts:139-141`) still resolves session + user row for public endpoints
  (`/api/packs`, cron, webhooks). Skip user resolution unless the handler asks for it.
- `GET /api/account/export` (`src/server/account/export.ts`) is unbounded (every row + one presign per file,
  pretty-printed in memory) and not rate-limited.
- Gallery grid is not virtualized (`components/app/media-grid.tsx`); after many "load more" pages the DOM grows without bound.
- The gallery list is client-fetched after hydration (`app/app/gallery/page.tsx`), a waterfall of HTML → ~250 KB gz JS →
  `/api/media` → images. Consider server-fetching the first page.
- Not perf, noticed in passing: the prerendered `index.html` has `<link rel="canonical" href="http://localhost:3100">`.
  `APP.url` is baked in at build time, so production builds must set `NEXT_PUBLIC_APP_URL`.

---

## 3. Things checked that are fine

- `/` and the other marketing pages are statically prerendered; `proxy.ts` matcher is `/app`, `/admin` only.
- `toJobDTOs` batches media loading (one query for many jobs); admin stats are aggregate queries run in parallel (no N+1).
- Pack registry is parsed once and cached in memory (`src/server/packs/registry.ts:20-70`); `/api/packs` sets `Cache-Control`.
- Safety models are lazy and cached per process (`getTfRuntime`, `getHuman`, `getNsfwModel`), with retry on failed init.
- The S3 SDK and presigner are lazy-imported; storage deletes are chunked (16 concurrent; S3 `DeleteObjects` 1,000/batch).
- The local file route streams with `Range` support (`src/server/storage/serve.ts`).
- Provider output downloads have a timeout and a 100 MB cap with streaming size enforcement (`fetch-output.ts`).
- `better-auth` cookie cache (5 min) avoids a session-table hit per request; `loadUser` is one PK lookup.
- `pollStaleJobs` uses `jobs_status_idx`; the per-job sync claim is a single conditional `UPDATE` (no double polling).
- No PGlite-specific SQL found; all queries are portable Postgres.
