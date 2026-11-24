# Safety providers (face + moderation)

The safety module (`src/server/safety`) always runs a **face provider** and a **moderation provider**.
They are selected by env and cannot be switched off: there is no "skip" flag, `src/lib/env.ts` rejects `mock`
safety providers whenever a real AI provider is configured, and the only threshold overrides that exist in code can
only make checks stricter.

| Env | Value | Implementation | Needs |
|---|---|---|---|
| `FACE_PROVIDER` | `local` (default with a real AI provider) | `src/providers/safety/local-face.ts`: @vladmandic/human 3.3.6, wasm backend, in-process | nothing |
| `FACE_PROVIDER` | `rekognition` | `src/providers/safety/rekognition.ts`: AWS Rekognition for detection/age/pose + local embeddings (hybrid) | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| `MODERATION_PROVIDER` | `local` (default with a real AI provider) | `src/providers/safety/local-moderation.ts`: nsfwjs MobileNetV2Mid + text heuristics | nothing |
| `MODERATION_PROVIDER` | `openai` | `src/providers/safety/openai-moderation.ts`: `omni-moderation-latest` over `fetch` | `OPENAI_API_KEY` |

Every provider **throws** on any failure (model missing, decode error, network error, HTTP error, malformed
response). Callers treat a throw as "blocked" (fail closed). Factories are cheap: models, sharp and the AWS SDK load
lazily on first use and are cached per process (a failed init is retried on the next call, not cached).

Shared plumbing:

- `tf-runtime.ts`: one tfjs-core instance, WebAssembly backend (SIMD, single thread; no native addon), and a
  `runExclusive` queue that serializes inference. human keeps per-process detector state, and the wasm backend is
  single-threaded anyway, so the queue costs no throughput.
- `node-require.ts`: loads the ML packages with Node's real `require` (from `createRequire(import.meta.url)`,
  falling back to `process.cwd()` when a bundler rewrote `import.meta.url` to a build path).
- `image-decode.ts`: sharp decode with EXIF orientation applied, alpha flattened, sRGB, and a 100 MP
  decompression-bomb limit.
- Model files are read from `file://` URLs in `node_modules` by a tfjs IO router. Node's `fetch` cannot read
  `file://`, and the router replaces the global-fetch shim shown in `docs/MODELS.md` §C.1. It only serves files
  under registered model directories.

---

## 1. Local face provider (`createLocalFaceProvider`)

**Pipeline.** The image is decoded with sharp, oriented upright and downscaled so its longest side is at most
1024 px. It then becomes an RGB int32 tensor and goes through `human.detect`. Three models from
`node_modules/@vladmandic/human/models` run on it:

| Model | Size | Role |
|---|---|---|
| `blazeface` | 0.6 MB | face detector (up to 20 faces, min confidence 0.3, rotation correction on) |
| `facemesh` | 1.6 MB | 468 landmarks, used for yaw/pitch/roll |
| `faceres` | 7.0 MB | age estimate + 1024-d descriptor |

human is built for video, so frame skipping and caching are turned off (`cacheSensitivity: 0`, `skipFrames: 0`,
`skipTime: 0`, `skipAllowed: false`). The result therefore depends only on the input image, and the same bytes
always give the same embedding (tested). After `load()` the provider checks that the backend is wasm and that all
three models loaded, and throws otherwise.

**Output (`DetectedFace`).**

- `faces` are sorted largest first. `box` is in pixels of the **upright source image** (EXIF applied), and
  `width`/`height` give that image's size.
- `confidence` is human's overall face score, 0..1.
- `embedding` is the faceres descriptor, **L2-normalized**, so cosine similarity is a dot product. A detected face
  without a descriptor throws, so faces are never silently under-counted.
- `age` is the faceres estimate in years. It is coarse and is **not** legal age verification. The safety module
  must add a margin (see `docs/MODELS.md` §C.1: route `< 25` to review).
- `yaw`/`pitch`/`roll` are in degrees. Negative yaw means the subject turned to **their own left** (the face points
  toward the right side of the image). We checked this on 153 sample faces: the yaw sign was always opposite to the
  nose's horizontal offset in the image. Mirroring the image negates both yaw and roll (tested).

**Match threshold: `matchThreshold = 0.60`** (cosine, `LOCAL_FACE_MATCH_THRESHOLD`).

- human's documented rule is that `human.match.similarity` ≥ 0.5 is a match. That rule is a Euclidean distance of
  10 on the raw descriptors, whose norms are 11-13. It corresponds to a cosine of about 0.59-0.70, or 0.65 at the
  typical norm of 12.
- Measured on the only real faces that ship in `node_modules`: `screenshot-facematch.jpg`, a grid of ~100 px crops
  in human's assets. To reproduce, run `pnpm exec tsx scripts/calibrate-face.ts --human-samples`:

  | Pairs | n | min | p05 | median | p95 | max |
  |---|---|---|---|---|---|---|
  | same person (18 photos of the library author, spanning years, sunglasses, face paint) | 153 | 0.436 | 0.497 | 0.653 | 0.785 | 0.896 |
  | different people (author × 71 others) | 1278 | 0.164 | 0.266 | 0.362 | 0.474 | 0.571 |

  On this set, a threshold of 0.60 gives a **0 % false-accept** rate and a **31 % false-reject** rate. The
  equal-error point is 0.48, and the lowest threshold with false accepts ≤ 0.1 % is 0.555. We chose 0.60 to keep a
  margin above the highest different-person score.
- Re-encoding, resizing, brightness changes, grayscale and EXIF rotation of the *same* photo score 0.94-1.00.

**Accuracy caveats (read before relying on it).**

- faceres is a small, weak recognizer. Two different women photographed side by side in
  `screenshot-facedetect.jpg` (150 px crops) scored **0.64-0.71**. Look-alike people with similar makeup, pose and
  expression can pass any threshold that still accepts real users. Treat the local match as a consent *consistency*
  check, not identity proof. For stronger assurance use Rekognition `compareFaces()` (section 3).
- Same-person scores fall with small, blurry or very different photos: the 31 % false-reject rate above comes from
  ~100 px crops. Real uploads (≤ 2048 px, face ≥ 300 px) score higher, but that is UNVERIFIED until you calibrate on
  real data.
- The descriptor depends on alignment. Faces turned more than about 45° match poorly.
- Age is accurate to within several years at best (UNVERIFIED). Sample faces estimated at 23-39 y looked about right.

## 2. Local moderation provider (`createLocalModerationProvider`)

### Images: nsfwjs

**Model.** nsfwjs 4.4.0 bundles three models inside the package, so nothing is downloaded:

| Model | Format | Size | Accuracy (nsfwjs README) | Runs on our deps? |
|---|---|---|---|---|
| MobileNetV2 | layers model, 224 px | 3.5 MB | ~90 % | no, needs `@tensorflow/tfjs-layers` |
| **MobileNetV2Mid** | **graph model, 224 px** | 5.7 MB | **~93 %** | **yes** (`tfjs-converter`) |
| InceptionV3 | layers model, 299 px | 29 MB | not stated | no, needs `@tensorflow/tfjs-layers` |

We use MobileNetV2Mid. We do **not** import `nsfwjs/core`, because it imports the `@tensorflow/tfjs` umbrella
(147 MB, not a direct dependency) and the `buffer` polyfill. Instead we `require` the package's base64 model bundles
(`nsfwjs/dist/models/mobilenet_v2_mid/*.min.js`) by absolute path, decode them, and run them with
`tfjs-converter.loadGraphModel` on the shared wasm backend. The bundles are evicted from the require cache after
loading. Preprocessing matches nsfwjs: the whole image is squashed to 224×224 (no crop) and pixels are divided
by 255.

**Policy** (`nsfw-policy.ts`, pure and table-tested). Categories: `["sexual"]`.

| Rule | Default | Why |
|---|---|---|
| Porn + Hentai ≥ `explicit` | **0.50** | `docs/MODELS.md` value. Benign party photos in human's samples reached 0.43 on 100-150 px thumbnails. |
| Sexy ≥ `suggestive` | **0.60** | Sexualized content is forbidden too: much stricter than the 0.85 in MODELS.md. |
| Porn + Hentai + Sexy ≥ `combined` | **0.70** | Catches mass split across classes, e.g. 0.35 porn + 0.35 sexy. |

`createLocalModerationProvider({ thresholds })` can only **lower** these values (`strictThresholds` clamps them).

Observed on benign images (solid colours, gradients, noise, portraits, human's demo screenshots): Porn + Hentai stayed
≤ 0.05 except on low-resolution thumbnails of women in party dresses, which reached 0.27-0.43. Caveats:

- The classifier cannot tell age. Minors are handled by the face age gate plus the text filters.
- Very small images and heavily stylized drawings are noisy.
- A single global 224 px view can miss a small explicit region in a large image. Provider-side checkers and the
  hosted classifier remain the second layer (`docs/MODELS.md` §B.11).

### Text

The authoritative prompt filter runs in `src/server/safety` regardless of provider. `checkText` adds a cheap,
high-precision heuristic layer (`text-heuristics.ts`):

- It blocks unambiguous sexual terms as `["sexual"]`. `nude` counts unless it is a fashion tone: "nude lipstick" and
  "nude heels" pass.
- It blocks CSAM terms, and sexual or suggestive words combined with minor indicators ("teen", "schoolgirl",
  "16 year old"…), as `["sexual", "minors"]`.
- It collapses obfuscation such as `p.o.r.n` and zero-width characters.

`detectPublicFigure` is **not** available locally (omitted).

## 3. Rekognition face provider (`createRekognitionFaceProvider`): hybrid

Rekognition does not export face embeddings, and the `FaceProvider` contract compares embeddings on our side. The
`rekognition` mode is therefore a hybrid:

- **Detection, face count, age and pose come from `DetectFaces`** (`Attributes: ["DEFAULT", "AGE_RANGE"]`).
  `age = AgeRange.Low`, the conservative bound. `confidence = Confidence / 100`. Yaw, pitch and roll are
  Rekognition's degrees; its sign convention relative to ours is UNVERIFIED, so gate on magnitude.
- **Embeddings, and therefore `matchThreshold`, come from the local human embedder.** It runs on the same upright
  JPEG, and each Rekognition box is paired with a local face by IoU (≥ 0.3, greedy one-to-one). If the local
  detector missed a face, that face is re-embedded from a padded crop. If that also fails, the face is returned
  with `embedding: []`, which callers must treat as "no match" (fail closed). The face still counts.
- **`compareFaces(source, target)`** wraps `CompareFaces` (`SimilarityThreshold: 0`) and returns the best
  similarity as 0..1, or null. Use it for high-assurance consent checks (consent selfie vs. a training photo), on
  top of the embedding match.
- **`detectCelebrity(bytes)`** on the provider, and **`createRekognitionCelebrityDetector(opts)`** for moderation
  with any backend, wrap `RecognizeCelebrities`. They return `{ isPublicFigure, name, confidence }`, with
  `isPublicFigure` set when MatchConfidence ≥ 90.
- Images are re-encoded as upright sRGB JPEG, longest side ≤ 2048 px, ≤ 5 MB (the Rekognition limit), because
  Rekognition does not reliably apply EXIF orientation. Boxes are scaled back to the source size.
- The client uses 3 attempts, a 15 s request timeout and a 5 s connect timeout. SDK errors propagate.
- IAM permissions needed: `rekognition:DetectFaces`, `rekognition:CompareFaces`, `rekognition:RecognizeCelebrities`.
- Cost: about $0.001 per image per call (UNVERIFIED, see `docs/MODELS.md` §C.3). `analyze` makes 1 call.
- Privacy: images leave your infrastructure. AWS may use content to improve its services unless you opt out
  through an AWS Organizations AI-services opt-out policy.
- Local human models still load in this mode, for the embeddings.

## 4. OpenAI moderation provider (`createOpenAIModerationProvider`)

The provider calls `POST https://api.openai.com/v1/moderations` with `model: "omni-moderation-latest"` through
`fetch` (no SDK). The endpoint is free. Text goes as a string. Images are re-encoded as JPEG (≤ 1024 px, ≤ 4 MB)
and sent as `[{ type: "image_url", image_url: { url: "data:image/jpeg;base64,…" } }]`. The timeout is 15 s. A
network error, any non-2xx status (including 429) or a malformed body **throws**. Empty text is allowed without a
call.

| OpenAI category | Blocks when flagged | Our category |
|---|---|---|
| `sexual` | yes, and also when score ≥ **0.5** | `sexual` |
| `sexual/minors` | yes, and also when score ≥ **0.1** | `minors` + `sexual` |
| `hate`, `hate/threatening` | yes | `hate` |
| `harassment/threatening` | yes | `harassment` |
| `self-harm`, `/intent`, `/instructions` | yes | `self_harm` |
| `violence/graphic` | yes | `violence` |
| `illicit/violent` | yes | `illicit` |
| `harassment`, `violence`, `illicit` | no (reported in `scores` only) | n/a |

The plain `violence`, `harassment` and `illicit` categories fire on benign photo prompts ("boxing match", "holding a
sword"), so they do not block on their own. The safety module's rules still apply. `detectPublicFigure` is not
offered.

## 5. Performance and memory (measured)

Measured in this sandbox: 4 vCPU, Node 22.23, wasm SIMD, single thread, 2-3 runs. Times include sharp decode.

| Operation | Time |
|---|---|
| Face models init (first `analyze`) | 0.2-0.35 s |
| Face `analyze`, 1 face, 1024 px input | 150-250 ms (first call +50-100 ms) |
| Face `analyze`, 1 face, 2048×1707 JPEG input (downscaled to 1024) | 200-270 ms |
| Face `analyze`, 6-face group photo | 0.75-1.0 s (≈ 120-150 ms per face) |
| nsfw model init | 80-120 ms |
| nsfw `checkImage` | 60-85 ms (2048 px input ≈ 70 ms) |
| 8 concurrent mixed requests (serialized) | 0.9-1.2 s total |

Memory (RSS, Node + tsx baseline ≈ 75-100 MB): about +300 MB once the face stack is loaded (wasm heap, faceres
weights, sharp), about +20-60 MB more for nsfw. Both loaded: **≈ 400-470 MB RSS**.

## 6. Deploying (Next.js, Vercel, Docker)

- **Runtime:** Node.js only (never Edge). These modules are server-only (`src/providers/**`).
- **Bundling:** `next.config.ts` already lists `@vladmandic/human`, the `@tensorflow/*` packages and `nsfwjs` in
  `serverExternalPackages`. The code loads them at runtime with Node's `require` from
  `createRequire(import.meta.url)`, obtained through `process.getBuiltinModule` so bundlers cannot rewrite it. It
  falls back to `process.cwd()`, which is `/var/task` on Vercel and holds `node_modules`. An esbuild bundle running
  from another directory was tested and works through the cwd fallback.
- **File tracing (Vercel / `output: "standalone"`):** the loaded files are reached by computed paths, so Next's
  tracer cannot see them. Add to `outputFileTracingIncludes["/**"]` in `next.config.ts`. This is the exact runtime
  closure, recorded with a `require`/fs trace:

  ```
  ./node_modules/@tensorflow/tfjs-core/{package.json,dist/tf-core.node.js}
  ./node_modules/@tensorflow/tfjs-converter/{package.json,dist/tf-converter.node.js}
  ./node_modules/@tensorflow/tfjs-backend-wasm/{package.json,dist/tf-backend-wasm.node.js,dist/*.wasm}
  ./node_modules/@vladmandic/human/{package.json,dist/human.node-wasm.js,models/blazeface.*,models/facemesh.*,models/faceres.*}
  ./node_modules/nsfwjs/{package.json,dist/models/package.json,dist/models/mobilenet_v2_mid/*}
  ```

  Traced size is about **19 MB**: models 9.0 MB face + 5.7 MB nsfw, tfjs JS 2.8 MB, wasm 1.1 MB, human 0.3 MB.
  sharp adds about 19 MB. That is far below Vercel's 250 MB unzipped limit. Verify with a preview deploy, or by
  checking `.next/standalone/node_modules` after `next build`.
- **Vercel function memory:** use **≥ 1024 MB** (RSS ≈ 450 MB plus request buffers). The cold start pays the module
  load plus about 0.3 s face init and 0.1 s nsfw init. `warmupLocalFaceProvider()` and
  `warmupLocalModerationProvider()` let a worker or cron preload them.
- **Docker / `pnpm worker`:** nothing special. Models are read from `node_modules` and there is no network access.

## 7. Recalibrating

**Face threshold.**

1. Collect a labeled set that looks like real traffic: ≥ 50 people with ≥ 3 photos each (selfies, phone photos,
   varied light and pose), laid out as `<dir>/<person>/<image>.jpg|png|webp`. Use people who consented. The script
   only reads the files locally.
2. Run `pnpm exec tsx scripts/calibrate-face.ts <dir>` (add `--json` for machine output and `--max-far 0.001` for
   the target). It reports:
   - the same-person and different-person cosine distributions;
   - false-reject and false-accept rates from 0.40 to 0.80;
   - the equal error rate;
   - the lowest thresholds with false accepts ≤ the target and ≤ 1 %;
   - how the current `LOCAL_FACE_MATCH_THRESHOLD` performs.

   It also lists images with no face (skipped) and images with several faces (largest used).
3. Set `LOCAL_FACE_MATCH_THRESHOLD` in `src/providers/safety/local-face.ts`. Prefer the "FAR ≤ 0.1 %" value. Never
   go below the equal-error point. Raising the threshold is always safe for consent; lowering it accepts more
   look-alikes.
4. Stored consent embeddings stay valid: only the comparison threshold changes.

**nsfw thresholds.** Change `DEFAULT_NSFW_THRESHOLDS` in `nsfw-policy.ts` only after measuring on a labeled set of
real uploads and outputs, and only downwards unless the false-positive rate is unacceptable *and* a second
classifier covers the gap. Per-deployment overrides through `createLocalModerationProvider({ thresholds })` are
clamped to the defaults.

**OpenAI score thresholds.** These are in `OPENAI_SCORE_THRESHOLDS` (`openai-moderation.ts`).
