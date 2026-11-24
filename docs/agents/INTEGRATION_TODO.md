# Wave 3 integration TODO (orchestrator)

- [ ] ingestVideos: AI-label metadata (ffmpeg `-metadata comment=`/XMP) + free-tier watermark overlay for videos.
- [ ] Engine: fail fast (no 3x retry) when a custom `complete` throws a non-retryable error (enhance request).
- [ ] Maintenance cron: call `resumeStalledDeletions()` from src/server/account; worker also runs maintenance hourly.
- [ ] Teams + multi-person invites: apply `invitesPerHour` rate limit; account confirm route → `accountDeleteConfirmPerHourPerIp`.
- [ ] Wire EnhancePanel into /app/edit/[mediaId] + EnhanceQuickActions into gallery viewer (if agents didn't).
- [ ] CI: run `pnpm packs:validate`.
- [ ] .env.example: STRIPE_PRICE_* (billing), SEED_ADMIN_NAME.
- [ ] i18n: move inline English UI copy into src/i18n/en.ts where practical (or note in KNOWN_ISSUES).
- [ ] next build + standalone trace check (ffmpeg, safety models), dev run, Playwright full journey + safety e2e.
- [ ] docker compose up (web image build; Docker Hub rate limits seen earlier).
- [ ] ledger: optional createdBy on refundJob (admin refund attribution) — admin currently patches the row in-tx.
- [ ] create page: use IdentityModelDTO.mode (added) instead of server-side map; MeDTO.draftsRemaining; ui/slider thumb aria-label; Idempotency-Key on POST /api/batches.
- [ ] billing: apply `billingPerMinute` to checkout/portal routes; .env.example STRIPE_PRICE_<PLAN>_<MONTH|YEAR> + STRIPE_PRICE_<PACKID>; SELF_HOSTING: Stripe webhook events list (checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, charge.refunded).
- [ ] build warning: child_process.spawn in src/providers/mock/render.ts (and any other spawn/fs dynamic path) traces whole project — add /*turbopackIgnore: true*/ or scope paths.
- [ ] billing public cards: link /login?next=/app/billing?plan=&interval= / ?pack= and auto-open checkout; derive '2 months free' from plans.
