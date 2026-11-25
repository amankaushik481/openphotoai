# Security review 2: OpenShoot

Second, offensive pass after [`security.md`](security.md). Every fix claimed there was re-tested by trying to break
it. Each new finding below was reproduced in a test that failed before the fix, except the S2-13 compose
hardening, which only `docker compose config` checks. Tests are listed with each
finding. They use real Better Auth, real route handlers and PGlite, and mock only email, ledger and session where
noted. Better Auth's origin checks are now on in tests (S2-5), so the auth tests exercise production behaviour.

Scope: `src/server/http.ts`, `src/server/rate-limit.ts`, `src/server/auth/**`, `src/lib/env.ts`, `src/proxy.ts`,
`next.config.ts`, storage and file serving, uploads, every `src/app/api/**/route.ts`, webhooks, API keys, Docker.
A live smoke test ran against `pnpm dev`: magic-link sign-in, sign-out, the demo, the gallery zip form under the new
CSP, and the main pages. It found no CSP or COOP console errors, and a copied cookie got 401 after sign-out.

**Counts:** 0 critical · 1 high · 4 medium · 8 low (13 findings, all fixed) · 3 deferred

## Findings

| ID | Sev | What it was | Fix | Test |
|---|---|---|---|---|
| S2-1 | **High** (all-mock production) | **The public dev mailbox handed out admin sign-in links.** An all-mock production deployment (a demo, or zero-key Docker exposed through a proxy) serves `/dev/emails` and `/api/dev/emails/latest?to=` to everyone. Anyone could `POST /api/auth/sign-in/magic-link {"email":"<an ADMIN_EMAILS address>"}`, read the link from the mailbox and get an admin session. That gave them every user's photos, the moderation queue and the ability to suspend users and grant credits. | `src/server/email/dev-mailbox.ts`: in production, every mailbox query (list, detail, latest) leaves out mail to `ADMIN_EMAILS` and to every account with the admin role. Admins of a demo deployment sign in with Google or real email. `SELF_HOSTING.md` now says demo accounts are public. Local dev and e2e (`NODE_ENV` ≠ production) are unchanged. | `security/production-2.test.ts` S2-1 |
| S2-2 | Medium | **Sign-out and session revocation took up to 5 minutes to apply** (the remainder of SEC-14). Better Auth's `cookieCache` trusted the signed `session_data` cookie without reading the session row. A cookie copied before sign-out, "revoke all sessions" or a session revocation kept working. | `src/server/auth/auth.ts`: `cookieCache: { enabled: false }`. Every request reads the session row: one indexed lookup, next to the user row that request auth already loads. | `security/auth-2.test.ts` S2-2 (sign-out, `revoke-sessions`); live smoke (copied cookie → 401) |
| S2-3 | Medium | **`ADMIN_EMAILS` promoted unverified identities.** `prepareNewUser` set `role: admin` from the address alone, and `admitSignIn` promoted existing accounts the same way. A Google (or future OAuth) profile that reports `email_verified: false` for an admin's address became an admin, either as a new account or on the next sign-in of an unverified one. Removing `trustedProviders` (SEC-8) had only closed the account-*linking* half of this. | `src/server/auth/user-policy.ts`: admin only when `emailVerified === true`, at creation and at sign-in. Magic-link sign-ups are verified by construction. | `security/auth-2.test.ts` S2-3; `auth/user-policy.test.ts` |
| S2-4 | Low | **Sign-up names bypassed the `PATCH /api/me` rules.** Disabling `update-user` (SEC-7) left the magic-link `name` field, which Better Auth stores on sign-up. The probe stored 20 021 characters (shown to teammates and in invite emails) and accepted bidi overrides. A NUL byte made the verify step fail with a 500. | `sanitizeDisplayName()` (strips control/bidi characters, collapses whitespace, max 80 chars) runs in the `user.create.before` and `user.update.before` hooks. | `security/auth-2.test.ts` S2-4 |
| S2-5 | Low (test gap) | **Better Auth skips its origin, callback-URL and CSRF checks when `NODE_ENV=test`** (`skipOriginCheck` defaults to `isTest()`). Every earlier auth test ran with them off, and probes "showed" open redirects such as `callbackURL=https://evil.example` and `errorCallbackURL=//evil` that production refuses. | `advanced.disableOriginCheck: false` (the production value), set explicitly. | `security/auth-2.test.ts` S2-5: foreign/protocol-relative/`javascript:` callback, error and new-user URLs are refused (403), the verify endpoint never redirects off-site, and cross-origin requests carrying the cookie are refused |
| S2-6 | Low | **The SSRF guard missed IPv6 spellings of private IPv4 addresses** (the remainder of SEC-15). WHATWG URL prints `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`, which skipped the dotted-quad check. IPv4-compatible (`::7f00:1`), NAT64 (`64:ff9b::a00:5`), 6to4 (`2002:a00:5::`), site-local, Teredo and documentation ranges, `192.0.0.0/24` and trailing-dot names (`localhost.`) also passed. | `src/providers/ai/shared/fetch-output.ts`: IPv6 literals are expanded to their 8 groups, and any embedded IPv4 is checked against the private ranges. Trailing dots are stripped before name checks. | `security/hardening-2.test.ts` S2-6 |
| S2-7 | Medium | **Per-IP limits became one bucket for the whole deployment when the IP was unknown** (`TRUSTED_PROXY_HOPS=0`, the Docker default). Any single client could block every user's account-deletion confirmation (10 garbage tokens an hour), every signed-in reporter (20/h) and the demo button (5/h). | `knownClientIp()` in `http.ts`. Deletion confirmations fall back to a per-token limit (the tokens carry about 190 bits, so they can't be guessed anyway). Signed-in reporters are limited per account. The demo relies on its deployment-wide limit. Anonymous reports stay fail-closed. | `security/ip-limits-2.test.ts`; `demo/login.test.ts` |
| S2-8 | Medium | **Production accepted the published MinIO password on a reachable endpoint.** `docker-compose.yml` tells remote operators to put MinIO behind a public hostname, and its root password defaults to the published `openshoot-dev-secret`. With both, anyone could list and read every consent selfie and training photo. | `src/lib/env.ts`: in production, `S3_SECRET_ACCESS_KEY` equal to a published default (`openshoot-dev-secret`, `minioadmin`) is refused unless `S3_ENDPOINT` is loopback or a Docker service name. The compose default keeps working. The documentation was updated. | `security/production-2.test.ts` S2-8 |
| S2-9 | Low | **Headers.** Pages had no `form-action` restriction and no COOP. `experimental.serverActions.bodySizeLimit` was 10 MB, although the app has no server actions, so a forged `Next-Action` POST could make the server buffer 10 MB. | Pages now send `form-action 'self'` (every form posts to this origin) and `Cross-Origin-Opener-Policy: same-origin` (sign-in, checkout and the portal are top-level navigations). The override was removed, so Next's 1 MB default applies. The live smoke confirmed sign-in, the demo and the zip form still work. | `security/hardening-2.test.ts` S2-9 |
| S2-10 | Low | **Mock AI webhooks were signed with `BETTER_AUTH_SECRET` itself.** The earlier review said they were purpose-bound, but that was only true for mock payments. The same key HMACs session cookies. | A derived key, `HMAC(secret, "openshoot:mock-ai-webhook:v1")`. | `security/hardening-2.test.ts` S2-10 |
| S2-11 | Low | **Authenticated API responses had no `Cache-Control`.** `/api/me`, `/api/media`, `/api/credits` and others returned emails, balances and signed photo URLs with no caching directive. A misconfigured shared cache in front of a self-hosted deployment could serve them across users. | `route()` adds `Cache-Control: private, no-store` to every session or API-key response that sets none of its own. | `security/responses-2.test.ts` |
| S2-12 | Low | **Unused Better Auth account endpoints were exposed.** `/link-social` let anyone holding a session (a stolen cookie, or XSS) attach *their own* Google account, which kept access even after "sign out everywhere". `/list-sessions`, `/get-access-token`, `/refresh-token` and `/account-info` gave raw session tokens and the linked Google tokens to page JavaScript. The app's UI uses none of them. | Added to `disabledPaths`, next to `/update-user`. Signing in with Google (implicit linking by verified email) is unaffected. | `security/auth-2.test.ts` S2-12 |
| S2-13 | Low (hardening) | **Containers kept Docker's default capability set.** | `web` and `worker` run with `cap_drop: [ALL]` and `no-new-privileges`. They already run as `node` on unprivileged ports. | `docker compose config` validates. Not run (no image build in this pass) |

## Re-tested from `security.md` (holding)

- **IDOR (SEC "Verified OK")**: `security/idor.test.ts` gives a victim one of every resource: a model and a training
  photo, a job, a batch, media, a folder, a share, an upload, an API key, a team with a member, a brand kit and a
  pending invite, and a multi-person invite and share. A second Studio user then calls **74 cases** through the session
  and an API key:
  - every id route, including the victim's photo deleted through the attacker's own model;
  - every job type that references the victim's model, media, upload, mask, garment or brand kit, through
    `/api/jobs`, `/api/batches` and v1;
  - the v1 id routes;
  - accepting or declining other people's invites;
  - all 11 admin routes as a non-admin.

  All 74 answer 403 or 404 and the victim's rows are unchanged. List filters (`folderId`, `modelId`, `batchId`,
  `ids`) return none of the victim's data, and the attacker can't move their own media into the victim's folder.
  A control asserts that the owner gets 200 on the same reads.
- **Magic links**: reuse and expiry are refused, and an expired link sets no cookie. Sign-in never adopts a planted
  session cookie (no fixation). Better Auth refuses a forged OAuth `state` before any token exchange (no network call).
  `/change-email` and `/delete-user` are off. (`security/auth-2.test.ts`)
- **API keys**: scopes on every v1 operation (`api-v1/routes.test.ts`) and on `user_or_api` routes
  (`security/api-key-scopes.test.ts`). Revocation applies on the next request, because every request looks up the
  hash with `revokedAt IS NULL`. Lookup uses the SHA-256 hash, so there is no string compare to time. No log line
  includes headers or keys.
- **Webhooks**:
  - fal: Ed25519, ±5 min, and the signed request id must match the body.
  - Replicate: Standard Webhooks HMAC with `timingSafeEqual`, ±5 min, and it fails closed without a secret.
  - Stripe: `constructEventAsync` on the raw text.

  All three verify before parsing JSON, cap the body at 4 MB and dedupe through `webhook_events`.
  (`providers/fal/webhook.test.ts`, `providers/replicate/webhook.test.ts`, `billing/stripe-provider.test.ts`)
- **Signed URLs**: a changed key, a longer expiry, an added `dl`, a missing signature or another secret all give
  403; an expired link gives 403; `..`, empty segments and absolute keys are refused. (`storage/*.test.ts`)
- **Uploads**: types are sniffed by magic bytes, never SVG or HTML. Everything is re-encoded, which strips EXIF/GPS
  and kills polyglots. Masks are binarized PNGs. Decoding is capped at 100 MP. A 10 000 × 10 000 PNG of 300 KB decodes
  in about 0.6 s at about 150 MB RSS, because libvips streams it (see D3). Outputs carry only the AI label
  (generator, job id, date).
- **CSRF**: `route()` refuses cookie-authenticated writes from another site, including multipart and form posts.
  Better Auth refuses a cross-origin request that carries a cookie. There are no CORS headers on any route.
- **XSS**: the only `dangerouslySetInnerHTML` is JSON-LD, which escapes `<`, `>` and `&`. Marketing markup comes
  from the repo. Email templates are React (escaped), and their subjects are clipped and stripped of newlines.
  The dev-mail iframe is `sandbox=""`.
- **Dependencies**: `pnpm audit --prod` finds 1 moderate issue: `esbuild ≤ 0.24.2` (dev-server CORS), pulled in via
  `better-auth > drizzle-kit > @esbuild-kit/core-utils`. It doesn't apply, because nothing runs esbuild's dev
  server at runtime and drizzle-kit is a CLI. The patched esbuild is a breaking 0.x release pinned by
  `@esbuild-kit`, so it isn't upgraded here. Every other production dependency is on its latest patch release, or
  one patch behind with no advisory (`better-auth` 1.7.27 → 1.7.28, `react` 19.3.0 → 19.3.1).

## Deferred

| ID | Sev | What remains | Why | Mitigation |
|---|---|---|---|---|
| D1 | Medium | When `TRUSTED_PROXY_HOPS=0`, **Better Auth's own limiter is one bucket for the whole deployment**. Magic-link sends and verifies each allow about 5 a minute and `/sign-in/social` 3 per 10 s for everyone, so one client can keep everybody from signing in. | Without a trusted proxy there is no trustworthy per-client key. Next only fills `X-Forwarded-For` when the client sent none. Turning the limiter off when the IP is unknown would let anyone send sign-in mail to arbitrary addresses in bulk from the operator's domain. | `SELF_HOSTING.md` now spells out this consequence. Production logs a one-time warning when requests arrive through a proxy with hops = 0. Per-recipient limits (5 an hour) still stop mail-bombing. Vercel defaults to 1 hop. Docker binds to loopback by default, so it can only be exposed through a proxy. |
| D2 | Low | Anonymous abuse reports still share one bucket (20 an hour) when the IP is unknown. | Without an IP, an anonymous report has no per-client key. Per-target buckets would let garbage share tokens mint unlimited buckets that flood the moderation queue and the takedown inbox. | Signed-in reporters are limited per account (S2-7), and the takedown email address on the share page still works. |
| D3 | Low | Uploads decode up to 100 MP (a 300 KB PNG). That costs about 0.6 to 1.2 s of CPU per upload, and a user may send 60 uploads a minute. | A lower cap would refuse 48 MP phone photos sent through the API (the web UI downsizes to 2048 px first). | Memory stays bounded (libvips streams). Uploads are rate-limited per account. |
