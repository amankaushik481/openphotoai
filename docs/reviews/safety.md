# Safety module: red-team review

Independent review of the OpenShoot safety module and every path that should call it. Report only:
no source file was changed. Reviewed on 2026-11-24 against the working tree.

**Scope.** `docs/SAFETY.md`, `docs/SAFETY_PROVIDERS.md`, `src/server/safety/**`, `src/lib/env.ts`,
`src/providers/registry.ts`, `src/providers/{mock,safety,ai}/**` (the safety-relevant parts),
`src/server/jobs/**` (engine and all 12 handlers), `src/server/media/{service,uploads}.ts`,
`src/server/models/**`, `src/server/together/**`, `src/server/teams/brand-kits.ts`,
`src/server/gallery/**`, `src/server/admin/{moderation,users}.ts`, `src/app/api/**` (incl. `v1`,
`uploads`, `prompt-helper`, consent, webhooks, dev mailbox), `packs/*.json` and `scripts/validate-packs.ts`.

**Method.** Code reading, plus executable probes in `/tmp/claude-0/probes/` (not committed):

- `text-probe.ts` runs ~300 evasion strings through `classifyText`, the always-on rule filter, and
  `evaluateTextHeuristics`, the text layer of the default `local` moderation provider.
- `safety-probe.test.ts` covers SAF-1, 2, 3, 4, 8 and 10 end to end on PGlite with the mock providers.
- `age-floor-probe.test.ts` covers SAF-9.
- `edit-template.test.ts` covers the edit-template part of SAF-5.

To run the vitest probes: `pnpm exec vitest run --config /tmp/claude-0/probes/vitest.config.mts --silent=false`.
All 8 probe tests pass, so every confirmed bypass reproduces.

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 6 |
| Medium | 9 |
| Low | 6 |

The top five, in order:

1. **SAF-1: the consent selfie is not a live capture.** The capture token is a bearer token that any
   script can get, and any JPEG is accepted with it. In Instant mode, 3 scraped photos of any adult
   give a ready model in seconds.
2. **SAF-2: retaking consent races with in-flight photo uploads.** Photos of person A are accepted
   while the consent on record is person B's live selfie. This defeats even a perfect liveness check.
3. **SAF-3: outputs are never age-checked.** Prompts that point at minors get past the filter easily,
   for example "at 15", "15 años", "7th grader", "high school student" and "make her look 12".
4. **SAF-4: video moderation never looks at the last 25% of a clip.** Confirmed with a 10 s clip whose
   explicit frames start at 7.6 s.
5. **SAF-5 and SAF-8: the prompt layer is weak.**
   - The default text stack (`local` provider) is English-only. Common euphemisms, "bra", outfit edits
     to "nothing", and every non-English term get through.
   - The assembled prompt (brand kit + prompt, edit templates) is never re-checked.

## Findings

Repro and Impact for each finding are listed after the table.

| ID | Sev | Where (file:line) | Bypass | Suggested fix |
|---|---|---|---|---|
| SAF-1 | **Critical** | `src/server/models/consent.ts:58-105, 118-171`; `src/app/api/models/[id]/consent/{challenge/,}route.ts` | Script the challenge call, then post any JPEG as the selfie (details below). | Real liveness (details below). |
| SAF-2 | **High** | `src/server/models/consent.ts:47-56, 133-151`; `src/server/models/photos.ts:110-166`; `src/server/safety/training.ts:186-188` | Retake consent while photo uploads are in flight. | Lock the model row and bind scores to the consent version (details below). |
| SAF-3 | **High** | `src/server/safety/outputs.ts:10-31, 34-61`; `src/server/media/service.ts:213-219`; `src/server/safety/text-filter.ts:47-60`; `src/server/safety/terms.ts:68-77` | Minor-indicating phrases that the filter misses. | Age-gate outputs and widen the minor patterns (details below). |
| SAF-4 | **High** | `src/server/images/video.ts:124-131`; `src/server/safety/outputs.ts:37-41`; `src/server/safety/policy.ts:23` | Explicit frames placed in the last quarter of a clip. | Sample the whole clip and fail on missing frames (details below). |
| SAF-5 | **High** | `src/server/safety/terms.ts`; `src/providers/safety/text-heuristics.ts`; default `MODERATION_PROVIDER=local` (`src/lib/env.ts:107-108`) | Euphemisms, other languages and outfit edits (examples below). | Real multilingual text classifier and stronger rules (details below). |
| SAF-6 | **High** | `src/providers/registry.ts:124-137`; `src/server/safety/providers.ts:53-60`; `src/server/safety/public-figures.ts` | Train a model from a celebrity's photos, or name them by nickname. | Make celebrity detection mandatory in production (details below). |
| SAF-7 | **High** | `src/providers/ai/fal.ts:57, 175-185`; `src/server/jobs/handlers/train.ts:167`; `src/server/models/service.ts:159-170, 179-180` | Delete a trained fal model: the LoRA stays on fal's CDN. | Make provider-side deletion real or retried, and say so (details below). |
| SAF-8 | **Medium** | `src/server/teams/brand-kits.ts:34-40`; `src/server/jobs/handlers/generate.ts:113-116`; `src/server/jobs/brand-kits.ts:29-34` | Split a blocked phrase across brand-kit fields. | Moderate the final assembled prompt (details below). |
| SAF-9 | **Medium** | `src/server/safety/policy.ts:17-19`; comparisons in `consent.ts:59`, `training.ts:72,147`, `faces.ts:40-42` | Make `TRAINING.minAge` non-numeric. | Coerce non-numbers to the floor and fail closed on NaN (details below). |
| SAF-10 | **Medium** | `src/server/media/uploads.ts:65-72`; `src/server/jobs/handlers/inpaint.ts:141, 179`; doc claim in `docs/SAFETY.md` §2 | Upload any PNG with `purpose=mask`. | Classify and normalize masks (details below). |
| SAF-11 | **Medium** | `src/providers/safety/local-face.ts:24`; `src/server/safety/training.ts:83-86`; `rekognition.ts:237` (`compareFaces` unused) | Use photos of a look-alike or a relative. | Use `compareFaces` and stricter matching (details below). |
| SAF-12 | **Medium** | `src/server/jobs/handlers/video.ts:128-147`; `edit.ts:105-109`; `inpaint.ts:170`; `try-on.ts:189-212`; `engine.ts:544-605`; `admin/moderation.ts:232-237` | Edit, animate or keep a partner's likeness from a together photo. | Add partner checks and cascade takedowns (details below). |
| SAF-13 | **Medium** | `src/server/safety/reference.ts`; `src/providers/ai/shared/identity-prompts.ts:108-125`; `fal/inputs.ts:150-170, 199-209` | Upload a photo of a real third party as a pose or style reference. | Block references that contain an identifiable face (details below). |
| SAF-14 | **Medium** | `src/server/email/dev-mailbox.ts:20-24`; `src/lib/env.ts` (no guard); `src/app/api/dev/emails/latest/route.ts` | Mock email in a production deployment that uses a real AI provider. | Refuse to start, or never enable the mailbox in production (details below). |
| SAF-15 | **Medium** | `src/lib/env.ts:98`; `src/config/plans.ts:102-105`; `src/server/media/service.ts:198, 305` | Set `WATERMARK_FREE_TIER=false`. | Remove the switch (details below). |
| SAF-16 | **Medium** | `src/lib/env.ts:104-111, 153-154` | Run production with `AI_PROVIDER=mock` or `MOCK_PROVIDERS=true`. | Guard mock safety providers in production (details below). |
| SAF-17 | Low | `src/server/safety/reference.ts:33-38`; `faces.ts:40-42`; `policy.ts:19` | A reference face of unknown age, or of an older-looking minor. | Fail closed on unknown age and add a margin (details below). |
| SAF-18 | Low | `src/server/images/process.ts:76-80` (`makeThumbnail` drops XMP); `src/config/plans.ts:104` | Use the thumbnail, or pay once. | Label thumbnails and review the `hasPaid` rule (details below). |
| SAF-19 | Low | No delete route or TTL for `uploads` (only `delete-account.ts`) | Uploaded photos persist indefinitely. | Delete uploads after use and add a delete route (details below). |
| SAF-20 | Low | `src/app/api/teams/[id]/brand-kits/route.ts`, `brand-kits/[id]/route.ts` (no `rateLimit`); `src/server/http.ts:160-164` | An unlimited moderation oracle, and spoofable IP rate limits. | Rate-limit kit writes and trust only a configured proxy (details below). |
| SAF-21 | Low | `src/server/models/service.ts:85` (`coverUrl` from `coverMediaKey`, which is a training-photo thumbnail) | A requester sees the partner's training-photo thumbnail. | Use a generated image or no cover for shared models. |
| SAF-22 | Low | `src/server/safety/multi-person.ts:21-44`; `src/server/admin/users.ts:227-270` | A suspended owner's model keeps working through shares. | Check the owner's status and revoke shares on suspension. |

### Repro and impact

**SAF-1 (Critical): the consent selfie is not a live capture.**
- **Repro:**
  1. `POST /api/models/:id/consent/challenge` returns `captureToken`. It needs no interaction and can be repeated.
  2. `POST /api/models/:id/consent` with `selfie=<any JPEG>` and that `captureToken`.
  3. Upload 3 more photos of the same person, then `POST /train {mode:"instant"}`.
- **Probe:** a downloaded photo of "alice" is accepted, and the consent record says `captureMethod:"camera"`.
- **Impact:**
  - The core consent rule reduces to "has 3 (instant) or 10 photos of one adult". This is a deepfake
    of any adult with a public social-media presence, free and immediate.
  - The comment at `consent.ts:4` ("stops scripted uploads of arbitrary files") is false.
  - `consent_records.evidence.captureMethod` is asserted, not observed.
- **Fix:**
  - Server-verifiable liveness: a passive liveness model or a provider such as Rekognition Face
    Liveness or a similar SDK, or an active challenge (random head-turn or blink sequence) verified
    on a short video server-side.
  - Bind the token to a liveness session result, not just to the user.
  - Until then, record `captureMethod:"unverified"`, require ≥10 photos plus training for every
    model, and don't call the selfie "live".

**SAF-2 (High): retaking consent races with in-flight training uploads.**
- **Repro:**
  1. Consent is alice, with 0 photos.
  2. Get a new challenge.
  3. Run in parallel `addTrainingPhoto(alice-02/03/04)` and `submitConsentSelfie(bob-01)`.
- **Probe:** all 4 succeed. The consent embedding is now bob (cos 0.99), 3 alice photos are
  accepted with scores 0.97–0.98, and `assertTrainingAllowed(instant)` passes.
- **Impact:**
  - The trained or instant identity (A) differs from the identity whose live selfie is on record (B).
  - The attacker can pass any future liveness check with their own face while the model is of the victim.
  - The audit trail points at the wrong person.
  - Stored scores are also never recomputed after a `FACE_PROVIDER` change.
- **Fix:**
  - Take a row lock on the model (or `consentVersion`) in both paths.
  - Store `consentVersion` (or the consent selfie id) on each `training_photos` row, and in the final
    gate count only photos scored against the current version.
  - Alternatively, store each photo's embedding and recompute cosine against the current consent
    embedding in `assertTrainingAllowed`, instead of trusting `faceMatchScore`.

**SAF-3 (High): outputs are never age-checked.**
- **Phrases that pass both text layers:**
  - "at 15", "15 years", "I'm 15", "seventeen", "almost 18", "barely 18"
  - "15 años", "15 ans", "15 jahre alt"
  - "high school student", "7th grader", "8th grade", "sophomore in high school", "junior high",
    "sweet sixteen", "at prom"
  - "in a school uniform with pigtails", "petite young-looking girl", "teenie"
  - "make her look 12", "de-aged to look 14", "age regression", "her stepdaughter", "with my little sister"
- **Probe:** an output with an age-9 face gives `checkOutputImage → allowed:true`.
- **Impact:**
  - Child-like depictions of real identities are generated, stored and shown.
  - The only gate is nsfwjs, which cannot judge age (`SAFETY_PROVIDERS.md` §2).
  - Combined with SAF-5 this can produce sexualized minor-looking imagery.
  - Talking-video scripts like "I'm 15 and I love you" also pass.
- **Fix:**
  - Add a face-age gate to `checkOutputImage` and to every video frame, using `analyzeFaces`, which
    is already run for likeness. Block when any face is < `minIdentityAge`, or < 18 for non-identity faces.
  - Record `underage` and fail closed.
  - Extend the minor rules: the "at/I'm/is N" age forms, non-English age words, grade, school and
    year phrases, de-aging verbs, and "look N".

**SAF-4 (High): video moderation never samples the last quarter of a clip.**
- **Cause:** frames are taken at `duration*i/n` for i=0..3, so at 0%, 25%, 50% and 75%.
- **Probe:** a 10 s clip with explicit frames only from 7.6 s on gives `allowed:true`. The control,
  explicit from 4 s, is blocked.
- **Also:** frames that fail to decode are silently skipped (`video.ts:128-130`), so a single good
  frame can clear a video.
- **Impact:**
  - Image-to-video and talking videos whose nudity appears late in the clip, which is where
    "slowly unzips…" motion ends, are stored and shown.
  - The prompt filter misses such motion (SAF-5).
- **Fix:**
  - Sample including the final frame (`i/(n-1)`), and sample at a rate of at least 1 fps.
  - Require that every requested sample decoded (fail closed otherwise).
  - Consider a per-second classifier pass for 5–10 s clips. It is cheap at 224 px.

**SAF-5 (High): the text filter is easy to evade, especially in the default configuration.**
- **Phrases that pass both layers:**
  - Euphemisms: "birthday suit", "in the buff", "au naturel", "disrobed", "unclad", "braless",
    "sheer mesh dress, no bra", "pulling down her top", "flashing the camera", "making love",
    "straddling a man", "wrapped only in a towel", "secksy", "pr0n", "n00dz", "nakid", "s*xy",
    "spicy OF shoot", "not safe for work".
  - Other languages: "desnuda", "sin ropa", "nue", "seins nus", "nackt", "oben ohne", "nuda",
    "pelada", "नंगी", "голая", "裸体", "ヌード", "çıplak", "telanjang".
  - Edits: outfit edit to "nothing", "a lace bra and briefs", "just a bedsheet", "a garter belt and
    stockings"; "remove the bikini top", "replace her clothes with nothing", "erase her clothing",
    "unzip the dress completely".
- **Note:** `bra` is banned by the pack validator but is not a runtime term.
- **Impact:**
  - With the default `MODERATION_PROVIDER=local`, the text layer is English keyword matching only.
  - Sexualized requests reach the provider. The 224 px nsfwjs classifier and the provider-side
    checker are then the only barrier.
  - `SAFETY.md` §8 acknowledges "English-first", but the default deployment has no multilingual layer at all.
- **Fix:**
  - Require a real text classifier in production (OpenAI omni-moderation, or a local multilingual
    model), or block non-Latin and non-English prompts when only `local` is configured.
  - Add the euphemism and clothing terms above, including "bra", "briefs", "towel/sheet only",
    "nothing", "remove …top".
  - Run the classifier on the final template text (see SAF-8), with an "outfit → nothing/none/minimal"
    rule for edits.

**SAF-6 (High): public figures get through in the default configuration.**
- **Cause:** `detectPublicFigure` exists only when AWS credentials are set. The default `local`
  providers have none, so consent selfies, training photos and references of celebrities pass.
- **Name filter misses:** "Musk", "Zuck", "The Rock", "POTUS", "45th/47th president", "Tay Tay",
  "Queen Bey", "Ye", "CR7", "Swifty", "SRK", "BTS", "Ivanka", "Kamala", "Xi", "Charles III",
  "Kate", "Trunp", "Drumpf", "Pootin", "Obamna", "Pope".
- **Impact:** a model of a celebrity can be trained via SAF-1, and the prompt name filter is then
  irrelevant because the identity itself is the celebrity.
- **Fix:**
  - In production, require a celebrity detector (fail closed if missing) or refuse to start.
  - Add the aliases and nicknames above.
  - Check outputs for public-figure resemblance when a detector exists.

**SAF-7 (High): deleting a model on fal does not delete it.**
- **Cause:**
  - fal `deleteModel` is a no-op that returns success, so `providerDeleted:true` is reported.
  - The LoRA is uploaded with `expiresIn:"never"` to a public CDN URL.
  - `jobs.output.modelRef` keeps that URL after `deleteModelCompletely`. Jobs survive model deletion
    with `modelId=null`.
  - For Replicate, a failure only logs and warns. The row is deleted with no retry or outbox.
- **Impact:**
  - "Real deletion" and the takedown procedure in `SAFETY.md` §6.4 do not remove the face model.
  - Operators and users are told it was removed.
- **Fix:**
  - Upload LoRAs with a finite lifecycle, or to your own bucket, and delete them from your storage.
  - Scrub `modelRef` and the plan from the job output on model deletion.
  - Return `providerDeleted:false` with a reason when the provider can't delete.
  - Persist failed deletions in a retry table that the cron processes.

**SAF-8 (Medium): brand-kit cross-field smuggling.**
- **Cause:** brand-kit fields are moderated one by one when saved, then appended to the prompt with
  `", "` and never re-checked.
- **Probe:** the kit {background "sunny beach, no", outfit "clothes", style "bent", lighting "over a
  sun lounger"} is created. A generate job runs with the final prompt
  `…relaxing, sunny beach, no, clothes, bent, over a sun lounger`.
  `classifyText(final)` would block it (`no clothes`, `bent over`).
- **Same issue elsewhere:** pack prompt + user suffix, edit and inpaint templates (see SAF-5), and
  multi-person templates.
- **Impact:**
  - Any multi-word blocked phrase can be split across fields.
  - A team admin's kit applies to every member's generations.
- **Fix:**
  - In `createJob`, also run `assertTextAllowed` on the assembled provider prompt (`plan.data.prompt`)
    after placeholder expansion, with the trigger word masked.
  - Keep the component checks for better error messages.

**SAF-9 (Medium): the age "hard floor" fails open on non-numeric config.**
- **Cause:** `Math.max(18, NaN)` is `NaN`, and `age < NaN` is always false.
- **Probe:** with `TRAINING.minAge = Number(process.env.UNSET)`, `SAFETY_POLICY.minIdentityAge` is
  `null` (NaN) and an age-9 consent selfie is accepted.
- **Impact:** one plausible "make it configurable" edit disables every age gate (consent, training,
  references), which contradicts "config can raise, never lower".
- **Fix:**
  - `const minAge = Number.isFinite(TRAINING.minAge) ? Math.max(18, TRAINING.minAge) : 18;` and the
    same for the margin.
  - Write the checks as `!(age >= min)`.
  - Add a test that freezes `minIdentityAge >= 20`.

**SAF-10 (Medium): mask uploads skip the classifier.**
- **Probe:** an nsfw-marked PNG is rejected as `reference` but stored as `mask` with
  `moderation:null`, and a signed URL is returned.
- **Impact:**
  - Unmoderated image hosting, with no EXIF stripping. Uploads are kept indefinitely (SAF-19).
  - When the size matches and there is no alpha, the raw image goes to the provider unthresholded.
  - The docs say "only the classifier runs" for masks.
- **Fix:**
  - Run `assertReferenceImageAllowed(…, {purpose:"mask"})`, which already exists.
  - Always threshold and re-encode masks to 1-bit PNG at upload.

**SAF-11 (Medium): the face match is too weak for a consent check.**
- **Cause:** the consent match uses the faceres cosine at 0.60. Two different women in
  `SAFETY_PROVIDERS.md` §1 scored 0.64–0.71. `compareFaces` (Rekognition) exists but is never called.
- **Impact:** sisters, look-alikes or similar makeup and pose pass the "training photo matches consent" rule.
- **Fix:**
  - When Rekognition is configured, require `compareFaces ≥ 90` for every training photo against the selfie.
  - Raise the local threshold to the measured false-accept ≤ 0.1% point plus margin, and calibrate on real data.
  - Require a match against a centroid of several photos, not just the selfie.

**SAF-12 (Medium): together photos are not bounded by the partner's consent.**
- **What the requester can do with a partner's likeness:**
  - Run custom edits or inpaints on the partner, for example "change the man's shirt to…" or
    "make him frown".
  - Run try-on on a together photo.
  - Animate it with `video`, which lacks the `assertSoloSource` check that talking videos have.
  - Do all of this after the share is revoked or the partner's model is deleted.
- **Other gaps:**
  - Jobs in flight finish after revocation (by design, `engine.ts` completion has no re-check).
  - Report `remove_media` deletes only the reported row, not its edits, upscales or videos.
- **Impact:**
  - The partner consented to "photos of us together", not edits or videos.
  - A takedown can't find derived or together media across users. `jobs.output.plan.modelIds` exists
    but isn't used.
- **Fix:**
  - Apply the solo or lineage check to `video`.
  - For group sources, block identity-changing edits, or require the share to still be active.
  - Re-check `assertModelsUsable` at completion.
  - On model deletion or takedown, delete or hide media whose job plan references the model, and
    cascade `remove_media` to `parentMediaId` descendants.

**SAF-13 (Medium): references can bring in a real third party.**
- **Cause:**
  - A reference or pose photo of any real adult is accepted. The only checks are sexual content, age
    < 18 and celebrities, and the celebrity check only runs with AWS.
  - In pose copy and in Instant generate with a style reference, that person's photo goes to Nano
    Banana together with the user's free-text "Additional direction".
  - The template's "Do not keep any facial features of the person in image 1" and "Only one person"
    are the only guard. An instruction such as "keep the man from image 1 next to the woman" is not
    filtered. Not verified against the live provider.
- **Impact:** a likely way around the multi-person consent rule, putting the user with a real,
  non-consenting person.
- **Fix:**
  - Reject references with a face that is not the user (match the face against the model's embedding).
  - Otherwise blur or crop faces from pose and style references before sending them.
  - Moderate "image 1 / keep the person" style instructions.

**SAF-14 (Medium): the public dev mailbox can be enabled in production.**
- **Cause:** `MOCK_PROVIDERS=true` with `AI_PROVIDER=fal`, or an explicit `EMAIL_PROVIDER=mock`, in
  production enables the public `GET /api/dev/emails/latest?to=…`.
- **Impact:**
  - It exposes magic sign-in links and multi-person invite links for any address, which means
    account takeover.
  - Invite acceptance depends on a verified email, so the consent binding is defeated.
- **Fix:**
  - In `env.ts`, refuse `emailProvider=mock` when `isProd` and `aiProvider!=="mock"`.
  - Never enable the mailbox when `isProd`.

**SAF-15 (Medium): the free-tier watermark can be switched off.**
- **Cause:** one env var removes the watermark for everyone.
- **Impact:** this contradicts "AI labeling + free-tier watermark regardless of env/config"
  (`SAFETY.md` §5 lists the label, not the watermark, but the stated policy needs both).
- **Fix:** remove the env switch, or document that it isn't a safety guarantee.

**SAF-16 (Medium): mock safety providers can run in production.**
- **Cause:** nothing stops a production deployment from running all-mock with real users. Every real
  upload is then judged by the mock providers: consent selfies, training photos, references and
  garments are "allowed", and every image counts as one adult face. `DEMO_MODE` is validated but
  otherwise unused.
- **Impact:** a public demo or misconfigured instance becomes an unmoderated photo host.
- **Fix:** in `isProd`, require `local` or better safety providers regardless of `aiProvider`, or
  disable uploads when safety is mocked.

**SAF-17 (Low): reference checks are weaker than identity checks.**
- **Cause:** references use age < 18 with no estimator margin, and faces with an unknown age pass.
  The identity paths treat unknown age as a fail.
- **Impact:** references of minors estimated 18 or older are accepted, for example garment model
  photos or pose references.
- **Fix:** treat unknown age as blocked, and add a margin for references that contain faces.

**SAF-18 (Low): thumbnails and paying users lose the labels.**
- **Cause:** `makeThumbnail` drops XMP, so thumbnails (used in share and gallery views) carry no AI
  label. Any user who ever paid (`hasPaid`) never gets a watermark again, even back on the free plan.
- **Fix:** add the XMP to thumbnails, and decide whether the watermark should follow the current plan.

**SAF-19 (Low): uploads are never deleted.**
- **Cause:** references (which can show third parties), garments and masks persist until the account
  is deleted. There is no delete endpoint or TTL.
- **Fix:** delete uploads after the job ends or after N days, and add `DELETE /api/uploads/:id`.

**SAF-20 (Low): no rate limit on kit writes, and spoofable IP limits.**
- **Cause:**
  - Brand-kit create and update run `assertTextAllowed` with no rate limit, which is a free oracle
    for probing the filter and costs OpenAI calls.
  - `clientIp` trusts `X-Forwarded-For`, so per-IP limits on reports and magic links can be
    bypassed. Reports also email any `email` the reporter supplies.
- **Fix:** add `rateLimit` to kit writes, and trust XFF only from a configured proxy.

## Verified OK

- Every job type goes through `createJob` → `handler.plan` → `assertTextAllowed(plan.textsToModerate)`
  before debit and submit. This covers web `/api/jobs`, `/api/v1/jobs`, batches (`createBatch` →
  `createJob`) and every handler: generate, pose_copy, edit, inpaint, video, talking_video,
  multi_person, plus the text-free enhancement, try-on and train handlers.
- Each handler moderates the right field. Edit instructions, inpaint prompts, video prompts,
  talking-video scripts, pack suffix prompts and together prompts are all included. Invite messages
  and brand-kit fields are moderated when saved.
- Media rows are created only by `ingestImages` / `ingestVideos`. Uploads never become media.
  Edit, upscale, video and try-on accept only `getOwnedMedia` (generated, not deleted or removed).
- Blocked outputs are never written: the classifier runs before `storage.put`, the provider `nsfw`
  flag is honored before download, and the job gets `blocked` plus a refund when all are blocked.
- Classifier, face or storage errors fail closed everywhere (`outputs.ts`, `reference.ts`,
  `consent.ts`, `training.ts`, `text.ts`). Logging failures don't change decisions.
- `toClassification` blocks when `allowed !== true` or when any sexual or minors category is present.
- Users cannot supply negative prompts: Zod strips unknown keys, and the helper's
  `negativePrompt` is never used for jobs.
- `fromDraftMediaId` re-renders only the user's own draft of the same model, reusing a prompt that
  was already moderated. A `prompt` sent alongside it is ignored, not used.
- Prompt-helper requests are moderated, and its output is returned only to the client. When used it
  is re-moderated as a job prompt. Its output is not used server-side.
- Pack prompts are static. `pnpm packs:validate` runs in CI with the runtime classifier
  (`.github/workflows/ci.yml:47`): 64 packs, 791 prompts, 0 errors. A spot-check of
  towel, robe and bed contexts found only benign uses.
- Multi-person:
  - `assertModelsUsable` runs at both plan and submit.
  - At least one model must be the requester's own.
  - A share must be granted by the current owner, accepted and unexpired.
  - Unknown and foreign ids get the same error.
  - Accepting an invite requires a verified, matching email.
  - Talking videos refuse together sources through a lineage walk.
- Training:
  - Consent is required before any photo upload.
  - Photos that fail a safety check are never stored.
  - Retaking consent requires zero photos (both in the check and under the update, apart from SAF-2's window).
  - Every face in a photo is age-checked, and an unknown age blocks.
  - The final gate runs for both trained and instant mode.
- `env.ts` rejects `FACE_PROVIDER=mock` or `MODERATION_PROVIDER=mock` with a real AI provider.
- The local nsfw thresholds can only be lowered. Provider-side checkers are always on
  (`enable_safety_checker:true`, Nano `safety_tolerance:"1"`, Replicate strict levels).
- LoRA refs and embeddings are not exposed in job or model DTOs. Media deletion is real
  (storage first, then rows). Account deletion cascades and runs the prefix delete.
- Every output video is re-muxed with the AI label, and the watermark is burned in for the free tier.
  Images get XMP `trainedAlgorithmicMedia`, and the watermark is applied before the label.
- Suspended users are refused on every `route()`, including API-key requests. Suspension revokes
  share links.
