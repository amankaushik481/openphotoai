# Server-side correctness review (GM-F)

A bug hunt over the domain logic: the job engine and handlers, the credit ledger, billing events, models (consent,
photos, training, deletion), media ingestion, gallery, teams, multi-person invites, account deletion, maintenance,
providers and config. Earlier reviews (`payments.md`, `security.md`, `safety.md`, `performance.md`) were read first,
so this pass goes after what they didn't cover: concurrency on **real Postgres**, lease and lifecycle races, provider
error mapping and limits under parallel requests.

**Method.** Code reading, then a failing test for each finding before the fix. Concurrency was reproduced on a
local Postgres 16 server through a new harness, `tests/helpers/postgres.ts`. Each test file gets its own database
(`<db>_<tag>`), so files can run in parallel. CI now runs every `postgres-concurrency` file (`.github/workflows/ci.yml`).
PGlite interleaves the awaited statements of concurrent requests, so the check-then-act races reproduce there too.

Severity: **High** means money, paid work or data is lost under a realistic trigger. **Medium** needs particular
timing or configuration. **Low** covers small leaks and inconsistencies.

## Findings (all fixed)

| ID | Sev | Where | Bug and repro | Fix | Test |
|---|---|---|---|---|---|
| COR-1 | High | `src/server/billing/events.ts` | **Payment events deadlocked.** Stripe sends `checkout.session.completed`, `customer.subscription.created` and `invoice.paid` for a new subscription within the same second. Applied concurrently, 18 of 45 events failed with `deadlock detected` on Postgres. The cause: inserting a payment or subscription row takes a KEY SHARE lock on the user row through the FK, and a concurrent event then can't upgrade to FOR UPDATE (credit grant, plan recompute). The documented order "subscription → user" also inverts when the subscription row doesn't exist yet. Two concurrent credit-pack purchases deadlocked the same way. Each loser returned 500, so Stripe retried minutes to hours later: the customer had paid but had no plan or credits until then. **Lost updates in the same race:** a `subscription.updated` that found no row and lost the insert was dropped silently (for example `cancel_at_period_end`, or the real period end). An `invoice.paid` that lost the insert to an `incomplete` row never promoted it, so the plan stayed free. | One lock order for every event: the account's user row first (`lockUserRow`, `resolveUser`, `findSubscription` and `lockPayment` lock it), then subscription and payment rows. All events of one account now serialize on one row. An insert that loses `ON CONFLICT` re-locks the winning row and applies the event to it (`updateSubscriptionFromEvent`, `upsertPaidSubscription`). DECISIONS #38. | `tests/unit/billing/postgres-concurrency.test.ts` (3 tests, all failing before) |
| COR-2 | High | `src/server/jobs/handlers/train.ts`, `src/server/jobs/engine.ts`, `src/server/models/weights.ts` | **Training completion races destroyed weights or gave training away.** (a) A completion attempt whose 5-minute finalization lease expired while it downloaded the LoRA (the weights fetch may take up to 10 min) was taken over by the cron. The attempt that finished first made the model ready. The other attempt found the model no longer `training` and called `discardWeights`. That deleted the provider's copy (Replicate) and our stored copy, which both attempts wrote to the same key. The result was a ready model with no weights: every generation failed and the 40-credit training was lost. A crash between the model update and the job's success transaction did the same on the retry. (b) A cancel (or model deletion) that landed after `complete()` set the model ready, but before the job's success transaction, left a ready model on a canceled job with a full refund (free training). | Handlers can return `commit(tx)`, `afterCommit()` and `discard()` with their `CompleteResult`. The train handler makes the model ready inside the transaction that marks the job succeeded, so it happens only if this attempt wins, and sends the email after commit. Each attempt writes its own weights object (`weights/{jobId}-{attempt}.safetensors`). A losing attempt deletes only its own copy, and deletes the provider's copy only once the job can't succeed any more. DECISIONS #39. | `tests/unit/jobs/train-finalize.test.ts` ("lease expired mid-download", "cancel while the model-ready email is sent" failed before; "cancel that wins" guards the other order) |
| COR-3 | Medium | `src/server/jobs/engine.ts` (`completeJob`) | **The finalization lease was never renewed.** Ingestion that ran longer than `FINALIZE_LEASE_SEC` (a slow LoRA or video download, a re-encode on a busy CPU) was taken over by the next poll. Two workers then downloaded, checked and stored the same outputs, and the first one's work was thrown away. If ingestion always took longer than the lease, no attempt could ever win until the 2-hour timeout refunded the job. | Heartbeat: the holder renews its lease every 60 s while it works. It stops after 30 min, so a hung attempt can still be taken over. | `train-finalize.test.ts` "a slow but healthy completion keeps its lease" |
| COR-4 | Medium | `src/providers/ai/fal.ts` (`getStatus`, `resultStatus`) | **Transient fal errors failed finished jobs.** A 5xx or 429 while fetching a **finished** result was mapped to `{state: "failed", retryable: true}`. The engine treats every `failed` status as terminal (it never resubmits), so the job was failed and refunded: a finished 20-minute training was thrown away because of one 502. A 401 or 403 (a rotated or revoked `FAL_KEY`) failed **every** running job on its next poll. Replicate already threw in both cases. | Status and result errors that say nothing about the job (network, 5xx, 429, 401/403) now throw, so the engine polls again later; timeouts still bound the wait. 404 and 422 stay terminal. | `tests/unit/providers/fal/fal-provider.test.ts` (5 new cases; the old "500 → failed" expectation encoded the bug) |
| COR-5 | Low | `src/server/models/service.ts` (`deleteModelCompletely`) | **Model deletion used a stale row.** It read the model, then set `deleting`. A training that completed in between had stored `providerModelRef`, but the in-memory row didn't have it, so the provider weights (Replicate) were never deleted and the deletion email said "none". | It uses the row returned by the `deleting` update. After that update, nothing can make the model ready, because completion requires `training`. | `train-finalize.test.ts` "deletes the provider weights a completion stored between the deletion's read and its update" (uses a trigger to make the interleaving deterministic) |
| COR-6 | Low | `src/server/models/crud.ts`, `src/server/models/photos.ts`, `src/server/jobs/engine.ts` | **Check-then-act on limits.** Parallel requests each passed a limit check before any of them wrote. In the tests: 4 identity models on the 1-model Free plan, 33 good photos on a 30-photo model (the check ran before the multi-second analysis), and 5 concurrent jobs on a 2-job plan. Batches had the same gap. | Each limit is re-checked under a row lock, right before the insert. Model count and job/batch concurrency use the user row, which createJob already locks for the debit. Photo counts use the model row, which the upload already locks for the consent check. The earlier checks remain as a fast path. | `tests/unit/models/limit-races.test.ts` (3 tests, all failing before) |
| COR-7 | Low | `src/config/plans.ts` | **Plan copy promised a feature that doesn't exist.** Studio advertised a "Priority queue", but the engine has no queue priority. | The Studio highlight is now "10 jobs at once" (its `maxConcurrentJobs`). A test checks every highlight that states a number against the plan config. | `tests/unit/core/plan-copy.test.ts` |

## New invariant and race tests (passing, kept as regression guards)

- **Ledger property test** (`tests/unit/jobs/ledger-invariant.test.ts`). Seeded random sequences, 5 seeds × 45
  steps, mix every operation that moves credits: paid, free, failing, blocked and stuck jobs (random likeness, so
  likeness refunds happen); batches; syncs; cancels; timeouts; admin refunds and adjustments; idempotent replays;
  team transfers; pack purchases; partial and full refunds; disputes won and lost. After every step the test asserts:
  - `user.credits` equals the ledger sum and the newest entry's `balanceAfter`;
  - for every job, `0 ≤ refunded ≤ charged` and the job's ledger entries sum to `refunded − charged`;
  - every failed, canceled or blocked job is refunded in full;
  - a balance is negative only after a purchase reversal.

  A coverage check confirms that every ledger reason and every job status occurred. No violation was found.
- **Postgres job race** (`tests/unit/jobs/postgres-concurrency.test.ts`). A 10-job batch, where each job gets two
  syncs, its completion webhook delivered twice, and a cancel, a timeout or a third sync, all concurrently. Every job
  ends in exactly one terminal state. Succeeded jobs keep their media and pay; failed and canceled jobs have no media
  and get a full refund. The batch counters add up and the ledger balances. Ran 5 times, no failure.

## Verified OK (no change needed)

- **Lock order outside billing.** createJob locks user → job, refundJob locks job → user, and team transfers lock
  sorted users. Account deletion locks the user row and then cascades. No payment transaction locks a job. No cycles.
- **Refund-once.** Refunds use ledger tags (`final`, `blocked`, `missing`, `likeness:i`, `admin`) capped at
  `charged − refunded` under the job row lock. failJob heals a refund that died half-way. A cancel during ingestion
  discards the media (lease token). A provider timeout, a submit error and a stuck `queued` job all refund.
- **State machines.** Terminal job transitions are conditional updates from `queued`/`running`. Trainings claim the
  model with a conditional update (training twice: the loser is refunded). Consent tokens are single-use, and a
  consent retake is locked against concurrent photo uploads. Invite accept, decline and revoke are conditional on
  status and token. Team seats are counted under the team lock. Shares and invites expire at read time.
- **Webhook vs polling.** The finalization lease plus `webhook_events` dedupe: never a double ingest (see the race
  test above).
- **Time.** All windows and expiries use UTC. Leases and polls compare with the database clock (`now()`). Expiry
  timestamps are written and checked with the same (app) clock, and there is no local-time arithmetic.
- **Queries.** `EXPLAIN ANALYZE` on Postgres with 5k users, 200k jobs, 400k media, 400k ledger rows and 50k
  moderation events covered 20 hot queries: the gallery (first page, folder, favorites + kind, hidden count, viewer
  neighbours), the jobs list (plus status filter), admin jobs (filter + cursor), pollStaleJobs (both queries), the
  concurrency count, the ledger page, the moderation queue, job DTO media, the webhook lookup, low-credit candidates,
  payments by user and the refund prefix scan. All use index scans and run in under 5 ms. The exception is the
  30-day admin stats aggregate (33 ms parallel seq scan at 43 % selectivity, which is correct). Keyset cursors compare
  at millisecond precision with an id tiebreak, so equal timestamps never skip or repeat rows.
- **Config.** Credit costs, draft allowances (5 / 30, reset at 00:00 UTC), plan limits, pack count (64 ≥ "40+") and
  the README cost table agree with `src/config/*`. Apart from COR-7, the plan highlights match.

## Deferred

These are listed in `docs/KNOWN_ISSUES.md` under "Correctness": Replicate prediction groups, provider work after a
provider-reported failure, team invites that never expire, the draft allowance on failed drafts, the job
`Idempotency-Key` body check, provider weights after a late training failure, the deletion run lease, the UTC
day boundary and maintenance step isolation.
