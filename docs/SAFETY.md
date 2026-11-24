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
| 4 | **No public figures.** Prompts naming public figures (about 500 names with aliases + generic phrases like "celebrity lookalike", "deepfake") are refused; uploaded references and consent selfies are checked with celebrity recognition when the provider supports it. | `public-figures.ts`, `terms.ts`, `reference.ts`, `consent.ts` |
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
   `PUBLIC_FIGURE_PHRASES`, `PUBLIC_FIGURES`, `NON_LATIN_TERMS`). Ages under 18 are detected by pattern
   ("15 year old", "15-year-old", "15yo", "15 y/o", "aged 12", "fifteen year old", "under 18", and the
   age contexts "{subject} at 15", "I'm 15", "she is 14", "when I was 12", "turning 16", "make her
   look 12", "15 years young", "girl of 12", "15 años / ans / Jahre / jaar / anni / anos / saal"), school
   grades ("7th grader", "eighth grade", "grade 9 student") and terms ("middle schooler", "high school
   student", "sweet sixteen", "barely 18", "age regression", "stepdaughter"…, plus es/fr/de/pt/it/nl/
   Hindi-Latin equivalents). Sexual terms include euphemisms ("birthday suit", "wearing nothing",
   "implied nude", "wet t-shirt", "only a towel", "bra", "garter belt"…), es/fr/de/pt/it/nl/Hindi-Latin
   nudity and underwear words (plus a few nudity words in Scandinavian, Finnish, Indonesian/Malay, Turkish,
   Filipino and Vietnamese), a substring list for non-Latin scripts (Hindi, Russian/Ukrainian, Chinese,
   Japanese, Korean, Arabic), and undressing patterns ("remove the bikini top", "replace her clothes with nothing",
   "unzip the dress completely", "change the clothing … to: nothing").
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

**Assembled prompt (SAF-8).** Each fragment passing on its own is not enough: brand-kit fields can split a
blocked phrase ("sunny beach, no" + "clothes"), and edit templates turn a harmless word into an undressing
instruction ("Change only the clothing of the woman to: nothing"). Handlers therefore also return
`JobPlan.assembledTexts`: the provider-bound text built from user text + brand-kit fragments + handler
templates, with identity trigger words masked. `createJob` runs `assertTextAllowed` on it after the
per-fragment check. Curated pack prompts stay out (they are static and validated in CI by
`pnpm packs:validate`); only their last 4 words are kept so a phrase spanning the pack prompt and the
user's suffix is still caught (`src/server/jobs/assembled-text.ts`). Negative prompts are never included.

### Outputs: `checkOutputImage` / `checkOutputVideo` — `outputs.ts`
Images go through `ModerationProvider.checkImage` **and an age gate**: every face found by the face
provider must be estimated ≥ `SAFETY_POLICY.minOutputAge` (18 + 2-year margin); a younger face or a face
of unknown age blocks the output (`output_blocked`, `categories: ["minors"]`, `reason: "underage"`).
Prompts that point at minors are easy to phrase around any text filter, so the output itself is checked.
Videos: frames are sampled across the **whole** clip (`extractSampleFrames`: ≥ 1 frame per second from
t = 0, evenly spread when that would exceed 32 frames, plus the very last frame) and each goes through
both gates; any blocked frame blocks the video. A sample that fails to decode, an unreadable video, a
face-provider error or a missing provider return a snapshot with `allowed: false, categories:
["moderation_error"]` (fail closed). Every block records `output_blocked` (sha256 of the bytes, never the
bytes). The caller (`ingestImages` / `ingestVideos`) discards blocked outputs and refunds them; the
provider's own `nsfw` flag is honored too. Thumbnails keep the AI label (XMP) of the full image.

### Uploaded references, garments and masks: `assertReferenceImageAllowed` — `reference.ts`
Classifier (sexual ⇒ `reference_blocked`) → face analysis (any face estimated < 19, i.e. 18 + a 1-year
estimator margin, **or of unknown age** ⇒ `underage`) → `detectPublicFigure` when the provider has it
(⇒ `public_figure`). Any provider error ⇒ `reference_blocked` + `content_blocked`.
- **Masks** run the classifier on what was sent, then only a pure black/white PNG re-encode is stored
  (no content, no metadata).
- **Faces in references and garments are blurred before storage** (`src/server/images/blur-faces.ts`).
  A pose/style reference may show a real third party, and the identity must always come from the user's
  own consented model, never from an uploaded photo (SAF-13).
- Uploads are job inputs, not gallery items: they are deleted after 30 days by the maintenance cron, and
  users can delete one at any time (`DELETE /api/uploads/:id`).

### Consent selfie + active liveness: `verifyConsentSelfie` (`consent.ts`) + `verifyLiveness` (`liveness.ts`)
**Active liveness (SAF-1).** `POST /api/models/:id/consent/challenge` issues a single-use, 5-minute
capture token bound to a random, ordered sequence of 2 head-pose steps out of "turn left", "turn
right", "look up", "look down" (stored as a hash + the steps in the model's metadata). The in-app
camera captures the frontal selfie, then guides the user through each step ("Turn your head slightly to
your left", 3-second countdown) and captures one frame per step; everything is posted together with the
token. The server consumes the token (a failed check needs a new challenge with new steps), verifies the
frontal selfie (below), then requires for the step frames: exactly one face each, the same person as the
frontal selfie (embedding similarity ≥ the face provider's `matchThreshold`), no two frames
near-duplicates (64-bit dHash distance ≥ 2), no face under 20, and — **whenever the face provider reports
head pose** — each step's yaw/pitch change vs. the frontal frame of ≥ 12° (turns) / 8° (tilts) in the
requested direction. The direction is enforced for providers whose sign convention is verified (`mock`;
`local` yaw); otherwise (`local` pitch, `rekognition`) the magnitude is enforced and opposite steps on
the same axis must move in opposite directions. A provider that measures pose for some frames but not
others fails closed. The evidence (challenge, measured deltas, similarities, thresholds, provider) is
stored in `consent_records.evidence.liveness` with `captureMethod: "camera+active-liveness"`.

**What this is and isn't.** This is *active* liveness: a scraped photo, or a replay of one photo, can no
longer give consent, and a random pose sequence must be answered live. It is **not** certified
presentation-attack detection (ISO 30107-3): an attacker with a video of the victim turning their head
(extracting matching frames), a 3D mask or a real-time deepfake puppet can still pass. For high assurance,
replace this check with a certified service such as **AWS Rekognition Face Liveness** (video session in
the browser via the Amplify FaceLivenessDetector component, server-side `GetFaceLivenessSessionResults`
with a confidence score and reference image) and keep the selfie-to-photos face match.

Checks on the frontal selfie, in order: classifier
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
the largest face. When the face provider offers a 1:1 comparison (`rekognition`: CompareFaces), the
photo must also reach a CompareFaces similarity ≥ 0.90 against the stored consent selfie (SAF-11); a
comparison error fails closed.

**Consent version (SAF-2).** The consent selfie can only be (re)taken while the model has no photos, and
a photo is only stored while the consent it was scored against is still the current one: both paths
lock the model row (`SELECT … FOR UPDATE`), the photo path re-checks `consentVerifiedAt` (the consent
version, set from the database clock) and the consent path re-counts photos under the lock. A retake
racing in-flight uploads therefore either fails ("Remove all photos…") or makes the uploads fail
("Your consent selfie changed…"); photos of A can never be stored under the consent of B.

### Final gate: `assertTrainingAllowed(model, ctx)` — `training.ts`
Runs right before a training job (trained or instant) is created. Requires: the caller owns the model;
`consentEmbedding` + `consentVerifiedAt`; at least 10 accepted photos (`trained`) or 3 (`instant`,
`metadata.mode`); every accepted photo has `faceMatchScore ≥ matchThreshold` and `ageEstimate ≥ 20`.
The consent embedding is re-read from the database (not taken from the caller's possibly stale row).
Photos missing either value, or stored **before** the current consent selfie (scored against another
embedding), are re-analyzed from storage against the current embedding and the values persisted; an
unreadable photo blocks training.

### Multi-person: `assertModelsUsable(userId, modelIds)` — `multi-person.ts`
Each model must exist, not be deleted, and be owned by the user or covered by a `model_shares` row with
`requesterUserId = userId`, `status = "accepted"`, `expiresAt > now` and `ownerUserId` equal to the
model's owner. Otherwise `multi_person_unauthorized` is recorded and `forbidden` ("…needs their
consent…") is thrown — unknown and foreign model ids get the same answer, so ids can't be probed.
Authorized models that aren't `ready` get `conflict`. A shared model whose owner is suspended stops
working too (reversible: nothing is revoked).

Together photos stay bounded by the partner's consent (SAF-12): editing, inpainting or trying a garment on
a photo that descends from a together photo requires the partner's share to still be accepted and
unexpired (and their model to exist); photo-to-video and talking videos refuse together photos (the
partner consented to photos, not to being animated or speaking). An admin `remove_media` takedown
cascades to everything derived from the removed media (edits, upscales, videos), recursively.

### Likeness: `likenessScore(bytes, embedding)` — `likeness.ts`
Largest face's cosine similarity to the identity embedding, clamped to 0..1 (null without a face or when
the embeddings come from a different face model). Feeds the best-shots picker and likeness guarantee
(`src/server/media/scoring.ts`).

## 3. Thresholds

| Value | Where | Notes |
|---|---|---|
| Identity (consent + training) minimum estimated age | `SAFETY_POLICY.minIdentityAge` = max(18, `TRAINING.minAge`) + max(2, `TRAINING.ageMargin`) = **20** | Hard floors: config can raise, never lower. |
| Reference/garment minimum estimated age | `SAFETY_POLICY.minReferenceAge` = max(18, `TRAINING.minAge`) + 1 = **19** | Unknown age is refused. |
| Output (image + video frame) minimum estimated age | `SAFETY_POLICY.minOutputAge` = **20** | Unknown age blocks the output. |
| Non-numeric / NaN config | `atLeast(floor, value)` in `policy.ts` | Falls back to the floor (fails closed); comparisons are written `!(age >= min)`. |
| Face match | `FaceProvider.matchThreshold` (local/human: 0.6, mock: 0.6) | Cosine similarity; calibrated per face model. Rekognition CompareFaces ≥ 0.90 in addition. |
| Liveness | 2 steps; yaw ≥ 12°, pitch ≥ 8°; dHash distance ≥ 2 | `LIVENESS_POLICY` in `liveness.ts`. |
| Photos before training | `TRAINING.minPhotos` (10) trained, 3 instant | |
| Video frames classified | 1 per second over the whole clip + the last frame (max 32) | |
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
2. **Review.** Admins review open reports alongside unreviewed `moderation_events` in `/admin/moderation`
   (`GET /api/admin/moderation`, newest first, each event tagged with its kind); marking an event reviewed
   (`POST /api/admin/moderation-events/:id/review`) removes it from the queue. Repeated `prompt_blocked`,
   `underage` or `multi_person_unauthorized` events from one account are a strong abuse signal.
3. **Action.** `POST /api/admin/reports/:id/resolve` with `remove_media` (deletes storage + row),
   `suspend_user` (suspends the account and records `account_suspended`) or `dismiss`.
   Actions record `report_actioned`.
4. **Takedown requests** from people depicted without consent go to `NEXT_PUBLIC_TAKEDOWN_EMAIL`
   (`APP.takedownEmail`, published on `/legal/acceptable-use`). Operators should act within
   48 hours: remove the media, delete the identity model and suspend the account when consent was
   clearly violated. `deleteModelCompletely` deletes everything under the model's storage prefix,
   **including our copy of the trained weights**, and asks the AI provider to delete its copy; it reports
   `providerDeleted: false` with the reason when the provider can't (fal has no file-deletion API: training
   outputs are stored there with a 1-day lifetime and the weights are copied into our storage when
   training completes, so fal's copy expires on its own; generation always uses our copy). The deletion
   email states what happened to the provider's copy.
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

- **Liveness is active, not certified.** The head-pose challenge (§2) defeats scraped photos and simple
  replays, but not a video of the victim turning their head, a 3D mask or a real-time deepfake. Use a
  certified service (e.g. AWS Rekognition Face Liveness) where the risk warrants it. Pose direction is
  only verified for providers whose sign convention we checked (magnitude-only otherwise).
- **Celebrity detection needs AWS.** Without `AWS_*` credentials there is no image-based public-figure
  check. Mitigations in every configuration: the name/alias prompt filter; consent requires a live,
  head-moving capture of the person, whose face every training photo must match; uploaded references are
  never used as an identity source (identity always comes from the user's consented model) and their
  faces are blurred before storage. Public deployments should configure Rekognition celebrity detection.
- **Estimators make mistakes.** Age estimation is less accurate for some ages, ethnicities and lighting;
  the margin produces false refusals for young-looking adults (support can't override it by design).
  Face matching can be fooled by look-alike relatives.
- **The text filter is keyword-based.** It covers English plus the most common nudity/minor words in
  es/fr/de/pt/it/nl/Hindi (Latin script), a handful of nudity words in other Latin-script languages and a
  short non-Latin list; everything else relies on the
  moderation provider (OpenAI's moderation is multilingual; the local provider is not). Novel slang,
  misspellings and context-dependent euphemisms ("hot and steamy", "OF") can evade rules; the output
  classifier and age gate are the backstop.
- **The public-figure list is not exhaustive** and only `rekognition` provides image-based celebrity
  detection; outputs are not checked for resemblance to public figures.
- **Videos are sampled** (1 frame per second + the last frame), not classified frame by frame: a flash
  shorter than a second between samples can be missed. Talking-video audio is generated from a script
  that passes the text filter, but the audio itself is not classified.
- **The free-tier watermark is a product feature, not a safety control.** `WATERMARK_FREE_TIER=false`
  removes it and users who ever paid never get it; the always-on safety label is the XMP/MP4
  `trainedAlgorithmicMedia` AI label (also on thumbnails).
- **Swimwear, shirtless and similar photos are allowed by the text filter**; whether an output is
  sexualized is left to the output classifier, whose threshold may differ between providers.
- Rule-based filters produce occasional false positives (e.g. "me holding a baby", "kid-friendly cafe")
  — blocking them is intentional given the product's purpose.
