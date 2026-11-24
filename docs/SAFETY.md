# Safety

OpenShoot makes realistic photos of real people. That is only acceptable when the person depicted
consented, is an adult, and the output is not sexual or deceptive. This document is the policy, how
the code enforces it, and what operators must (and must not) do.

The safety module is `src/server/safety/` (contract: `src/server/safety/index.ts`). It is a core
module, not a plugin: **there is no env var, setting, plan or admin switch that turns any of it off.**

## 1. The rules

| # | Rule | Enforced by |
|---|---|---|
| 1 | **Consent.** A model can only be trained from photos of the person who took a live consent selfie. Every training photo must face-match that selfie. | `verifyConsentSelfie` (`consent.ts`), `analyzeTrainingPhotoSafety` + `assertTrainingAllowed` (`training.ts`) |
| 2 | **Adults only.** Training is refused if anyone in the consent selfie or any training photo is estimated under 18 + a 2-year margin. References showing anyone under 18 are refused. Prompts that mention children or ages under 18 are refused. | `consent.ts`, `training.ts`, `reference.ts`, `text-filter.ts` |
| 3 | **No sexual content.** Every prompt/instruction/script passes a rule filter *and* the moderation provider; every generated image and video passes an output classifier. Blocked outputs are discarded before storage — never stored, never shown — and refunded. | `text.ts`, `outputs.ts` (callers: `src/server/media/service.ts`) |
| 4 | **No public figures.** Prompts naming public figures (≥ 300 names + generic phrases like "celebrity lookalike", "deepfake") are refused; uploaded references and consent selfies are checked with celebrity recognition when the provider supports it. | `public-figures.ts`, `terms.ts`, `reference.ts`, `consent.ts` |
| 5 | **Multi-person consent.** Every identity in a job must be owned by the user or shared with them through an accepted, unexpired in-app invite granted by the model's owner. | `assertModelsUsable` (`multi-person.ts`) |
| 6 | **Everything blocked is recorded** in `moderation_events` for the admin moderation queue. | `events.ts` |
| 7 | **Fail closed.** If a classifier, face model or storage read fails, the request is blocked (outputs are marked `allowed: false`, category `moderation_error`). An outage can never let content through. | every module |

Related platform rules (owned by other modules, listed for completeness): edits/upscale/video/try-on only
operate on media OpenShoot generated for the same user (DECISIONS #11); every output carries IPTC
`DigitalSourceType=trainedAlgorithmicMedia` metadata and free-tier outputs get a visible watermark
(`src/server/images/process.ts`); the provider-side safety checker is always enabled; rate limits on all
generation endpoints; report button, moderation queue, suspension and real deletion.

## 2. How each check works

### Text: `assertTextAllowed(texts, ctx)` — `text.ts`
1. **Rule filter** (`text-filter.ts`, always on, no network). Categories: `sexual`, `minors`,
   `public_figure`, `violence_gore`, `hate`. Term lists are exported from `terms.ts` /
   `public-figures.ts` (`SEXUAL_TERMS`, `MINOR_TERMS`, `VIOLENCE_GORE_TERMS`, `HATE_TERMS`,
   `PUBLIC_FIGURE_PHRASES`, `PUBLIC_FIGURES`). Ages under 18 are detected by pattern
   ("15 year old", "15-year-old", "15yo", "15 y/o", "aged 12", "fifteen year old", "under 18").
   Evasion handling (`normalize.ts`): NFKD + diacritics stripping (fullwidth, math-bold, circled and
   regional-indicator letters), Cyrillic/Greek/small-caps homoglyphs, zero-width and other invisible
   characters, leetspeak (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`; `l` also matches `1`), separators inside
   words (`s.e.x`, `s-e-x-y`), spaced-out letters (`s e x y`), repeated letters (`seeexxxy`).
   Matching uses word boundaries so "Sussex", "assessment", "class photo", "kidney bean", "cocktail",
   "analysis", "spices" pass. A short list of known-safe phrases (`TEXT_FILTER_EXCEPTIONS`: "baby blue",
   "cum laude", "child's pose", "minor adjustments", "Gore-Tex"...) is blanked out *before* leetspeak
   decoding and only when separated by plain whitespace, so an exception can never hide an obfuscated term.
   Patterns are built so user input can't trigger catastrophic regex backtracking (tested with
   adversarial 1,500-character prompts).
2. **Moderation provider** (`getModerationProvider().checkText`, each text separately). A result is
   treated as blocked when `allowed` is false **or** it reports a sexual/minors category.
3. Blocked ⇒ event `prompt_blocked` (or `public_figure` when that is the only category) and
   `AppError("content_blocked")` with a friendly message for the most severe category
   (minors > sexual > public figure > violence > hate). `details.categories` lists canonical categories.
   Provider error ⇒ same, category `moderation_error`.

Callers pass only user-written text (prompts, edit instructions, talking-video scripts, prompt-helper
requests). **Do not pass negative prompts** ("nsfw, nude" is a normal negative prompt).

### Outputs: `checkOutputImage` / `checkOutputVideo` — `outputs.ts`
Images go through `ModerationProvider.checkImage`. Videos: 4 evenly spaced frames are extracted with
`extractVideoFrames` and each is classified; any blocked frame blocks the video. Errors, zero frames or a
missing provider return a snapshot with `allowed: false, categories: ["moderation_error"]`. Every block
records `output_blocked` (sha256 of the bytes, never the bytes). The caller (`ingestImages` /
`ingestVideos`) discards blocked outputs and refunds them; the provider's own `nsfw` flag is honored too.

### Uploaded references, garments and masks: `assertReferenceImageAllowed` — `reference.ts`
Classifier (sexual ⇒ `reference_blocked`) → face analysis (any face estimated < 18 ⇒ `underage`) →
`detectPublicFigure` when the provider has it (⇒ `public_figure`). Masks carry no faces, so only the
classifier runs. Any provider error ⇒ `reference_blocked` + `content_blocked`.

### Consent selfie: `verifyConsentSelfie` — `consent.ts`
The selfie is captured live with the camera (no file picker in the UI). Checks, in order: classifier
(not sexual), exactly one face (0 ⇒ "We couldn't see your face…", >1 ⇒ "Only you should be in the
selfie…", both `consent_required`), estimated age known and ≥ 20 (else `underage` event +
"OpenShoot is for adults only"), usable embedding, not a recognized public figure. Failures record
`consent_failed` (minors and public figures record the more specific `underage` / `public_figure`). Returns the L2-normalized embedding stored on `identity_models.consentEmbedding`.

### Training photos: `analyzeTrainingPhotoSafety` — `training.ts`
Runs on every upload; returns `error` issues merged into the quality report, each with a plain-language
message and fix: `no_face`, `multiple_faces`, `face_mismatch` (cosine to the consent embedding below the
face provider's `matchThreshold`: "This doesn't look like the person in your consent selfie." / "Only
upload photos of yourself."), `underage` (youngest face < 20, or age unknown), `nsfw`, and `unreadable`
when a provider fails. Mismatch, underage and nsfw are recorded (`face_mismatch`, `underage`,
`reference_blocked`). `ageEstimate` is the lowest age of any face; `faceMatchScore` the raw cosine of
the largest face.

### Final gate: `assertTrainingAllowed(model, ctx)` — `training.ts`
Runs right before a training job (trained or instant) is created. Requires: the caller owns the model;
`consentEmbedding` + `consentVerifiedAt`; at least 10 accepted photos (`trained`) or 3 (`instant`,
`metadata.mode`); every accepted photo has `faceMatchScore ≥ matchThreshold` and `ageEstimate ≥ 20`.
Photos missing either value are re-analyzed from storage and the values persisted; an unreadable photo
blocks training.

### Multi-person: `assertModelsUsable(userId, modelIds)` — `multi-person.ts`
Each model must exist, not be deleted, and be owned by the user or covered by a `model_shares` row with
`requesterUserId = userId`, `status = "accepted"`, `expiresAt > now` and `ownerUserId` equal to the
model's owner. Otherwise `multi_person_unauthorized` is recorded and `forbidden` ("…needs their
consent…") is thrown — unknown and foreign model ids get the same answer, so ids can't be probed.
Authorized models that aren't `ready` get `conflict`.

### Likeness: `likenessScore(bytes, embedding)` — `likeness.ts`
Largest face's cosine similarity to the identity embedding, clamped to 0..1 (null without a face or when
the embeddings come from a different face model). Feeds the best-shots picker and likeness guarantee
(`src/server/media/scoring.ts`).

## 3. Thresholds

| Value | Where | Notes |
|---|---|---|
| Identity (consent + training) minimum estimated age | `SAFETY_POLICY.minIdentityAge` = max(18, `TRAINING.minAge`) + max(2, `TRAINING.ageMargin`) = **20** | Hard floors: config can raise, never lower. |
| Reference/garment minimum estimated age | `SAFETY_POLICY.minReferenceAge` = max(18, `TRAINING.minAge`) = **18** | |
| Face match | `FaceProvider.matchThreshold` (local/human: 0.6, mock: 0.6) | Cosine similarity; calibrated per face model. |
| Photos before training | `TRAINING.minPhotos` (10) trained, 3 instant | |
| Video frames classified | 4 | |
| Text stored per blocked prompt | 200-char excerpt + sha256 | |

Age estimators are noisy (±3–5 years); the 2-year margin trades some false refusals of young-looking
adults for a much lower chance of training on a minor. Unknown age is treated as "not verified".

## 4. Why it can't be disabled

- No code path reads an env var or setting to skip a check. Thresholds live in `policy.ts` with hard floors.
- `src/lib/env.ts` refuses to start with `FACE_PROVIDER=mock` or `MODERATION_PROVIDER=mock` when a real AI
  provider is configured, so production always has real classifiers (`local` needs no keys).
- The rule-based text filter runs even when the provider is mock, local or hosted.
- Every check fails closed; a missing or broken provider blocks instead of allowing.
- AI providers are always called with their own safety checker enabled.

## 5. What self-hosters must not change

You may add terms or names, tighten thresholds, or plug in stronger providers (`docs/ADDING_PROVIDERS.md`).
You must not, and the license/acceptable-use terms of a public deployment should prohibit:

- removing or weakening any check in `src/server/safety/`, the hard floors in `policy.ts`, or the
  safety invariant in `src/lib/env.ts`;
- adding an "uncensored"/"NSFW" mode, an allowlist of users who bypass checks, or file upload for the consent selfie;
- storing or displaying blocked outputs, or disabling the provider-side safety checker;
- removing the AI-generated labels, the report button, or the takedown contact.

If you need stricter rules (e.g. block swimwear), add terms to `terms.ts` or raise thresholds. Changing
`FACE_PROVIDER` invalidates stored consent embeddings (different embedding space): affected users must
retake the consent selfie — mismatched dimensions are treated as "no match", never as a pass.

## 6. Abuse reports and takedowns

1. **Report.** Anyone can report a shared image (`/s/[token]` → `POST /api/reports`, IP rate limited).
   Reports land in the `reports` table.
2. **Review.** Admins review open reports alongside `moderation_events` in `/admin/moderation`
   (`GET /api/admin/moderation`). Events can be filtered by kind; repeated `prompt_blocked`,
   `underage` or `multi_person_unauthorized` events from one account are a strong abuse signal.
3. **Action.** `POST /api/admin/reports/:id/resolve` with `remove_media` (deletes storage + row),
   `suspend_user` (suspends the account and records `account_suspended`) or `dismiss`.
   Actions record `report_actioned`.
4. **Takedown requests** from people depicted without consent go to `NEXT_PUBLIC_TAKEDOWN_EMAIL`
   (`APP.takedownEmail`, published on `/legal/acceptable-use`). Operators should act within
   48 hours: remove the media, delete the identity model (`deleteModelCompletely` removes provider-side
   LoRAs too) and suspend the account when consent was clearly violated.
5. **Child sexual abuse material.** Never forward or download it for "review". Preserve the
   `moderation_events`/`reports` rows, suspend the account and report it to the competent authority
   (in the US, providers must report apparent CSAM to NCMEC's CyberTipline under 18 U.S.C. § 2258A;
   in the EU/UK, your national hotline / IWF). Consult counsel about preservation obligations before deleting.

## 7. What is stored

`moderation_events` rows: `userId`, `jobId`, `modelId`, `kind`, `details`, `reviewed`. Details contain
categories, provider name/scores/reason, sha256 of images/videos (never the bytes), at most a 200-char
excerpt + sha256 of blocked text, matched filter terms (≤ 40 chars each), face counts/ages, match scores
and error messages. Embeddings are never written to events or returned by the API.

## 8. Known limitations

- **No liveness detection.** The consent selfie is camera-only in the UI, but someone could hold a photo or
  screen up to the camera. Celebrity recognition (when available) and the public-figure prompt filter
  reduce, but don't remove, this risk. A passive liveness check is planned work.
- **Estimators make mistakes.** Age estimation is less accurate for some ages, ethnicities and lighting;
  the margin produces false refusals for young-looking adults (support can't override it by design).
  Face matching can be fooled by look-alike relatives.
- **The text filter is English-first.** Other languages rely on the moderation provider (OpenAI's
  moderation is multilingual; the local provider is not). Novel slang and misspellings can evade rules.
- **The public-figure list is not exhaustive** and only `rekognition` provides image-based celebrity
  detection; outputs are not checked for resemblance to public figures.
- **Videos are sampled** (4 frames), not classified frame by frame. Talking-video audio is generated from
  a script that passes the text filter, but the audio itself is not classified.
- **Swimwear, shirtless and similar photos are allowed by the text filter**; whether an output is
  sexualized is left to the output classifier, whose threshold may differ between providers.
- Rule-based filters produce occasional false positives (e.g. "me holding a baby", "kid-friendly cafe")
  — blocking them is intentional given the product's purpose.
