# Wave 3 integration TODO (orchestrator)

- [x] ingestVideos: AI-label metadata (ffmpeg `-metadata comment=`/XMP) + free-tier watermark overlay for videos.
      (MP4 `comment`/`description`/`creation_time` tags via `applyVideoAiLabel`; watermark = the image pill as PNG overlay, re-encoded H.264; helpers in src/server/images/video.ts.)
- [x] Engine: fail fast (no 3x retry) when a custom `complete` throws a non-retryable error (enhance request).
      (`isNonRetryable` / `NonRetryableError` in src/server/jobs/util.ts; applies to default ingestion too; transient AppErrors `rate_limited`/`provider_error` still retry.)
- [x] Maintenance cron: call `resumeStalledDeletions()` from src/server/account; worker also runs maintenance hourly.
      (`WORKER_MAINTENANCE_INTERVAL_MS`, default 1 h, 0 = off; never overlaps itself.)
- [x] Teams + multi-person invites: apply `invitesPerHour` rate limit; account confirm route → `accountDeleteConfirmPerHourPerIp`.
- [x] Wire EnhancePanel into /app/edit/[mediaId] + EnhanceQuickActions into gallery viewer (if agents didn't). (Verified: already wired.)
- [x] CI: run `pnpm packs:validate`.
- [x] .env.example: STRIPE_PRICE_* (billing), SEED_ADMIN_NAME.
- [x] i18n: move inline English UI copy into src/i18n/en.ts where practical (or note in KNOWN_ISSUES). See "i18n: what's left" below.
- [ ] next build + standalone trace check (ffmpeg, safety models), dev run, Playwright full journey + safety e2e.
- [ ] docker compose up (web image build; Docker Hub rate limits seen earlier).
- [x] ledger: optional createdBy on refundJob (admin refund attribution) — admin currently patches the row in-tx.
- [x] create page: use IdentityModelDTO.mode (added) instead of server-side map; MeDTO.draftsRemaining; ui/slider thumb aria-label; Idempotency-Key on POST /api/batches.
- [x] billing: apply `billingPerMinute` to checkout/portal routes; .env.example STRIPE_PRICE_<PLAN>_<MONTH|YEAR> + STRIPE_PRICE_<PACKID>; SELF_HOSTING: Stripe webhook events list (checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.refunded).
      (There is no SELF_HOSTING doc yet: the events list sits next to STRIPE_WEBHOOK_SECRET in .env.example.)
- [x] build warning: child_process.spawn in src/providers/mock/render.ts (and any other spawn/fs dynamic path) traces whole project — add /*turbopackIgnore: true*/ or scope paths.
      (Also src/server/images/video.ts, src/providers/safety/{node-require,tf-runtime,local-face,local-moderation}.ts and the local storage roots. The `next build` item above confirms it.)
- [x] billing public cards: link /login?next=/app/billing?plan=&interval= / ?pack= and auto-open checkout; derive '2 months free' from plans.
- [x] gallery: apply downloadsPerHour to POST /api/media/download.
- [x] API keys: scope selection (`*` / `read` / `generate`) in POST /api/api-keys + UI; v1 uploads endpoint (`POST /api/v1/uploads`) for reference/garment/mask; v1 batches Idempotency-Key once engine supports it.
- [x] account: remove cast around deleteModelCompletely in src/server/account/delete-account.ts (now returns {providerDeleted, providerError?, storageObjectsDeleted}). (Already typed; no cast was left.)

## i18n: what's left

Done: the app shell, navigation, user menu, error pages, dashboard, model picker and job status were already on `t()`.
This pass moved the generic request-failure fallback (`errors.tryAgain`, via `apiErrorText()` in src/lib/api-client.ts)
and the most visible empty states (gallery folder / filters, first model, create results, credit history) into
src/i18n/en.ts.

Still inline English (a full migration was out of scope):
- Feature screens: create/pack studio controls and `describeApiError` titles (src/components/create/*), edit/enhance,
  video/talking video, try-on, together, teams, settings, billing cards/dashboard, API keys manager, admin pages.
- Model wizard + camera capture copy (src/components/models/*).
- Marketing pages, FAQ and legal content (src/content/*, src/app/(marketing)/**) and email templates (src/emails/*).
- Server error messages (`errors.*` in route handlers and services) are shown verbatim by the UI. Translating them
  needs the client to map error codes + `details` instead.
