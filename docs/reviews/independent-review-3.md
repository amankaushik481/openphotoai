# Independent review 3: the "god mode" pass

Six agents worked in parallel on UI/UX (marketing, core flows, gallery, account/billing/admin), security and server
correctness. After merging, two independent reviewers who hadn't seen the agents' reports read the combined diff
(`08c101c..`): one covered server and security code, the other the UI. Every finding below was traced in code and
fixed, and each has a regression test that fails without its fix.

## Server and security

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| R3-1 | Medium | The concurrency check moved under the user-row lock. As a result, a second parallel request with the same `Idempotency-Key` waited for the first, counted the first one's job, and returned `plan_limit`. This broke "replays return the original" for a job that had been created and charged. `createBatch` had the same problem. | Inside the locked transaction, look up the key first and return the original job. The pre-check outside the lock treats a just-committed replay the same way. A batch replay that hits the plan limit hands over to the winning batch. | `tests/unit/jobs/idempotency-replay.test.ts` |
| R3-2 | Low | The admin job inspector redacted only strings that *started with* a URL or storage key. Signed URLs inside provider error text (`failureDetail`) were shown. | URLs, data URIs and `users/…` keys are replaced wherever they appear. The job input gets the same treatment. | `tests/unit/admin/jobs.test.ts` |
| R3-3 | Low | An error in the success transaction escaped `completeJob`. That transaction includes the handler's `commit`, e.g. the model turning ready. As a result, the lease was held until it expired, `discard()` never ran (each attempt's weights copy was orphaned), and attempts never reached `MAX_FINALIZE_ATTEMPTS`. | Handle it like an ingestion error: drop that attempt's outputs and weights copy, then release the lease, or fail and refund after the last attempt. | `tests/unit/jobs/train-finalize.test.ts` |

## UI

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| R3-4 | Medium | The create page keeps results and the unsent prompt in browser storage. The next account to sign in on the same tab (on a shared computer) saw the previous account's prompt and results. | `ViewerStorageScope` clears every `openshoot:` key when a different account signs in. Sign-out clears them too. | `tests/unit/create/viewer-storage.test.ts` |
| R3-5 | Low–Medium | The "leave page?" prompt lived in the dropzone. Once the user left the photos step, the shared queue kept uploading, and a reload or tab close lost those uploads without warning. | The upload queue owns the `beforeunload` guard while files are in flight. | `tests/unit/ui/upload-queue.test.ts` |
| R3-6 | Low–Medium | Global shortcuts didn't treat confirm dialogs (`role="alertdialog"`) as open overlays. In "Delete this photo?", `c` or `g g` navigated away, and `?` opened a second modal on top. | Use a shared `OVERLAY_SELECTOR` that includes `alertdialog`. | `tests/unit/ui/shortcuts.test.ts` |
| R3-7 | Low | The checkout return counted any purchase from the previous 5 minutes. A second purchase within 5 minutes showed "Payment received" with the first one's credits, and polling stopped. | The success URL carries the checkout's start time (`since`), and only payments from then on count. | `tests/unit/billing/ux-regressions.test.tsx` |
| R3-8 | Low | The viewer's "Try again" never reloaded: the signed URL is identical within its window, so the `<img>` was kept. A file that kept failing also refreshed forever. | A pure `viewerLoadStep` re-creates the element (a `key` bump) and allows one automatic refresh per failure. | `tests/unit/gallery/viewer-load.test.ts` |
| R3-9 | Low | Batch retries used `retry:{jobId}:{n}`, and the counter restarted on reload. Because the server keeps keys forever, a retry after a reload returned the earlier failed retry. | A fresh key per click; the `submitting` state already covers double clicks. | Not covered by a unit test; the component needs a browser environment. |

## Checked and found OK

**Server:**
- The lease heartbeat and every way it stops.
- The `commit`/`afterCommit`/`discard` paths when an attempt loses the race or is canceled.
- Every billing handler locks the user row first.
- The sessions API: scoped by user, returns no tokens, checks same-origin.
- No UI calls the disabled Better Auth endpoints.
- `Cache-Control` defaults are not applied to file, download or OG routes.
- Team invite expiry.
- The `knownClientIp` fallbacks.
- The SSRF guard against IPv6 and IPv4 spellings. Hostnames are not resolved, by design, and https is required.
- No migrations are needed.

**UI:**
- UploadQueue internals.
- Settings restore on the create page.
- Gallery cache patching.
- Viewer swipe, zoom and history.
- The sessions card.
- Moderation triage.
- Login typo hints and the resend cooldown.
- The verify-page account-switch warning.
- Prices come from config.
- Email templates.
- Marketing pages stay server-rendered.
