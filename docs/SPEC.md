# OpenShoot — Product Spec

OpenShoot is an open-source, self-hostable AI photographer: upload selfies, get a private identity model, then
create professional photos and videos of yourself. It matches photoai.com feature-for-feature and beats it on
honesty (refunds, likeness guarantee), speed (instant drafts, instant mode), openness (self-host, public API,
open pack format) and safety (consent-verified training, adults only, no sexual content).
See `docs/RESEARCH.md` for the market analysis behind these choices and `docs/CONTRACTS.md` for APIs.

## 1. Users & jobs to be done
- **Job seeker / professional** — LinkedIn headshots that look like them, fast, cheap.
- **Dater** — natural, varied, flattering-but-real photos.
- **Creator / founder** — lots of on-brand content (travel, lifestyle, press), video clips, talking videos.
- **Team lead / agency** — consistent headshots for a whole team (brand kit), API for automation.
- **Self-hoster / developer** — run it for themselves or as a business; add packs/providers without forking.

## 2. Feature list (shipped)

### Core
1. **Selfie upload + quality checker** — 10–30 photos (Trained mode) or 3–10 (Instant mode). Client resizes to
   ≤2048px; server strips EXIF/GPS. Per-photo checks: resolution, blur (Laplacian variance), exposure, contrast,
   exactly one face, face size, head-pose variety, near-duplicates (pHash), plus safety (face matches consent selfie,
   adult, not sexual). Every issue has a plain-language message **and a fix-it tip**. Readiness panel shows counts,
   pose variety (frontal/left/right/up/down), blockers and tips. Training is disabled until ready.
2. **Identity model** — two modes:
   - **Instant** (beats photoai): ready in seconds, no training cost; uses reference-based identity models.
   - **Trained** (best likeness): FLUX-family LoRA training via fal/Replicate; progress UI; "model ready" email.
3. **Generate** from a prompt, a pack, or a style reference image. Aspect ratios, 1–8 images, seed control.
4. **Photo packs** — 40+ themed packs as JSON files in `packs/` (no code to add one). Public pack gallery pages
   double as SEO landing pages.
5. **Pose / style copy** — upload any reference photo, get yourself in that pose and setting.
6. **Edit** — change outfit, background, hair, expression or anything (instruction edit); **brush inpainting**.
7. **Upscale** (2×/4×) + **face restore**, **background removal**.
8. **Photo → video** (5s/10s) and **talking video** from a script (TTS voice + lip-sync).
9. **Virtual try-on** — upload a garment, see it on one of your photos.
10. **Together photos (multi-person)** — combine two identity models; the second must be yours or shared with you
    through an accepted in-app invite (consent).
11. **Gallery** — favorites, folders, filters (model/pack/kind/batch), bulk select, zip download, share links,
    "show hidden" for best-shots-hidden images.
12. **Credits** — append-only ledger; every debit/refund recorded; automatic refunds on failures, blocked outputs,
    cancellations and (with a real face provider) low-likeness outputs.

### Beat photoai.com
- **Instant drafts** — free fast previews (daily cap), click "Full quality" to re-render the same seed.
- **Best-shots picker** — each output scored for likeness (face embedding vs your consent selfie) + quality;
  weak outputs hidden by default; **likeness guarantee** refunds outputs below the threshold.
- **Prompt helper** — "me on a yacht at sunset looking rich" → optimized prompt (LLM; template fallback).
- **Batch mode** — one pack → up to 50 images in one click with live progress (`/app/batches/[id]`).
- **Brand kit for teams** — background/outfit/style/lighting/aspect presets applied to every member's headshots.
- **Public API** — API keys, OpenAPI 3.1 spec at `/api/v1/openapi.json`, docs at `/docs/api`.
- **Mobile-first, fast** — Lighthouse 90+ on landing; bottom navigation on phones; camera capture for consent.
- **Honest pricing** — credits never expire (plans and packs); automatic refunds for failures, blocked outputs and low-likeness results.
- **Privacy** — training selfies deletable any time; real deletion (storage + provider model) confirmed by email.

### SaaS layer
- Landing, pricing, FAQ, packs gallery, legal (terms, privacy, acceptable use incl. takedown contact) as
  editable templates using `NEXT_PUBLIC_LEGAL_*` / `APP` config.
- Stripe Checkout (subscriptions + one-time credit packs, inline price data), customer portal, webhooks
  (idempotent, out-of-order safe), plan limits (models, batch size, concurrency, API access, team seats).
- Admin dashboard: users (search, credits adjust, suspend), jobs (failures, refunds), revenue, provider cost per
  job, moderation queue (reports + safety events).
- Emails: magic link, welcome, model ready, training failed, low credits, receipt, deletion confirm/complete,
  invites, suspension.
- i18n-ready (`src/i18n`, English shipped). PostHog analytics only when a key is set.

## 3. Safety (core module — see `docs/SAFETY.md`)
Consent selfie (live camera) → every training photo must face-match it; adults only (age estimate ≥ 18 + margin);
prompt filter + output classifier on every image/video (no env flag disables it; blocked outputs never stored);
public-figure prompt/reference blocking; multi-person requires ownership or accepted invite; AI-generated labels
(IPTC DigitalSourceType XMP metadata on every output) + visible watermark on free tier; report button +
moderation queue + suspension + takedown contact; real deletion; rate limits on all generation endpoints.
**Real AI provider ⇒ real safety providers** is enforced in `src/lib/env.ts`.

## 4. Key user flows
1. **Sign up** — magic link or Google → welcome email → dashboard with "Create your model" CTA.
2. **Buy credits** — `/pricing` or `/app/billing` → Stripe Checkout (mock checkout page in mock mode) →
   webhook grants credits → receipt email.
3. **Create model** — `/app/models/new`: name + subject → **live consent selfie** (camera; no file upload) →
   upload photos (instant feedback per photo) → readiness OK → choose Instant (free) or Trained (40 credits) →
   progress → "model ready" email.
4. **Generate** — `/app/create`: pick model, prompt or pack, ratio, count → Draft (free) or Full → results stream
   in; best shots shown first → favorite / edit / upscale / video / share / download.
5. **Pack batch** — `/app/packs/[slug]` → "Generate 50" → live progress page.
6. **Edit** — from any photo: outfit/background/hair/expression/custom, brush inpaint, upscale, remove bg.
7. **Video** — from any photo → 5s/10s clip or talking video (script + voice).
8. **Together** — invite a friend by email → friend accepts and picks their model → pick a pack/prompt.
9. **Download** — gallery multi-select → zip.
10. **Delete account** — settings → email confirmation link → everything deleted (storage, provider models,
    rows) → final confirmation email.

## 5. Credit costs (src/config/credits.ts)
| Action | Credits |
|---|---|
| Instant model | 0 |
| Trained model | 40 |
| Draft preview (per image; 30/day after first purchase, 5/day before) | 0 |
| Standard photo (per image; Instant-mode models ×2) | 1 |
| High quality photo (per image) | 2 |
| Pose copy / edit (per image) | 2 |
| Brush inpaint | 2 |
| Upscale 2× / 4× | 2 / 5 |
| Face restore / background removal | 1 |
| Try-on | 3 |
| Together photo (per image) | 3 |
| Video 5s / 10s | 10 / 18 |
| Talking video (per started 5s of speech) | 8 |

Plans (USD/month): Free (watermark until first purchase), Starter $15 (200 cr), Pro $39 (600 cr, API, batch 50),
Studio $99 (2,000 cr, teams/brand kits). Packs: 100 cr $9, 500 cr $39, 1,500 cr $99. Yearly = 10× monthly.

## 6. Data model
See `src/db/schema.ts` (27 tables): Better Auth (`user`, `session`, `account`, `verification`), identity
(`identity_models`, `training_photos`, `consent_records`, `model_shares`), jobs (`jobs`, `batches`), media
(`media`, `uploads`, `folders`, `share_links`), safety (`reports`, `moderation_events`), money (`credit_ledger`,
`subscriptions`, `payments`, `webhook_events`), platform (`api_keys`, `rate_limits`, `email_outbox`,
`deletion_requests`), teams (`teams`, `team_members`, `brand_kits`).
Identity model mode is stored in `identity_models.metadata.mode` (`"instant" | "trained"`).

## 7. Page map
See `docs/CONTRACTS.md` §5.
