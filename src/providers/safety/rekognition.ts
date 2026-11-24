/**
 * AWS Rekognition face provider (hybrid).
 *
 * Rekognition does not export face embeddings, and the FaceProvider contract compares
 * embeddings on our side, so this provider is a hybrid:
 *   - detection, face count, age (AgeRange.Low — the conservative bound) and pose: Rekognition
 *     DetectFaces;
 *   - embeddings (and therefore `matchThreshold`): the local @vladmandic/human embedder, run on
 *     the same upright image and paired with each Rekognition face by box overlap.
 * For a stronger one-off verification (consent selfie vs. photo) use `compareFaces()`
 * (Rekognition CompareFaces). `detectCelebrity()` wraps RecognizeCelebrities for the moderation
 * layer. All network/SDK errors propagate: callers fail closed.
 */
import type { DetectedFace, FaceProvider } from "../types";
import { loadSharp, toUprightJpeg } from "./image-decode";
import { createLocalFaceProvider } from "./local-face";

/** Rekognition accepts JPEG/PNG up to 5 MB as raw bytes. */
const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;
const REKOGNITION_MAX_SIDE = 2048;
/** Minimum IoU for pairing a Rekognition box with a locally detected face. */
const MIN_PAIR_IOU = 0.3;
/** Celebrity MatchConfidence (0-100) at or above which `isPublicFigure` is true. */
const DEFAULT_CELEBRITY_MIN_CONFIDENCE = 90;

/** Anything with the SDK client's `send` (lets tests inject a fake without network). */
export interface RekognitionSender {
  send(command: object): Promise<unknown>;
}

export interface RekognitionOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Test seam / custom client. Defaults to a lazily created `RekognitionClient`. */
  client?: RekognitionSender;
  /** Embedding source. Defaults to the local human provider. */
  embedder?: FaceProvider;
  celebrityMinConfidence?: number;
}

export interface PublicFigureResult {
  isPublicFigure: boolean;
  name?: string;
  /** 0..1 */
  confidence?: number;
}

export interface CompareFacesResult {
  /** 0..1 similarity of the best-matching face in `target` to the largest face in `source`; null if none. */
  similarity: number | null;
  matchedFaces: number;
  unmatchedFaces: number;
}

export interface RekognitionFaceProvider extends FaceProvider {
  compareFaces(source: Uint8Array, target: Uint8Array): Promise<CompareFacesResult>;
  detectCelebrity(bytes: Uint8Array): Promise<PublicFigureResult>;
}

/* ───────────────────────── response shapes (subset of the SDK types) ───────────────────────── */

interface RkBox {
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
}
interface RkFaceDetail {
  BoundingBox?: RkBox;
  Confidence?: number;
  AgeRange?: { Low?: number; High?: number };
  Pose?: { Yaw?: number; Pitch?: number; Roll?: number };
}
interface RkDetectFacesResponse {
  FaceDetails?: RkFaceDetail[];
}
interface RkCompareFacesResponse {
  FaceMatches?: { Similarity?: number }[];
  UnmatchedFaces?: unknown[];
}
interface RkRecognizeCelebritiesResponse {
  CelebrityFaces?: { Name?: string; MatchConfidence?: number }[];
}

type Box = DetectedFace["box"];

/* ───────────────────────── pure helpers (exported for tests) ───────────────────────── */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Convert a Rekognition ratio box to pixels, clamped to the image. */
export function ratioBoxToPixels(b: RkBox | undefined, width: number, height: number): Box {
  const left = clamp01(b?.Left ?? 0);
  const top = clamp01(b?.Top ?? 0);
  const right = clamp01((b?.Left ?? 0) + (b?.Width ?? 0));
  const bottom = clamp01((b?.Top ?? 0) + (b?.Height ?? 0));
  return {
    x: Math.round(left * width),
    y: Math.round(top * height),
    width: Math.round((right - left) * width),
    height: Math.round((bottom - top) * height),
  };
}

export function boxIoU(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy one-to-one pairing by IoU. Returns, for each `target` box, the index into `candidates` or -1. */
export function pairByIoU(targets: Box[], candidates: Box[], minIoU = MIN_PAIR_IOU): number[] {
  const pairs: { t: number; c: number; iou: number }[] = [];
  targets.forEach((t, ti) =>
    candidates.forEach((c, ci) => {
      const iou = boxIoU(t, c);
      if (iou >= minIoU) pairs.push({ t: ti, c: ci, iou });
    }),
  );
  pairs.sort((p, q) => q.iou - p.iou);
  const result = targets.map(() => -1);
  const used = new Set<number>();
  for (const p of pairs) {
    if (result[p.t] !== -1 || used.has(p.c)) continue;
    result[p.t] = p.c;
    used.add(p.c);
  }
  return result;
}

/** Map one DetectFaces FaceDetail (pixel box already computed) to our contract, without embedding. */
export function mapFaceDetail(detail: RkFaceDetail, box: Box): Omit<DetectedFace, "embedding"> {
  const age = detail.AgeRange?.Low;
  return {
    box,
    confidence: clamp01((detail.Confidence ?? 0) / 100),
    age: typeof age === "number" ? age : undefined,
    yaw: detail.Pose?.Yaw,
    pitch: detail.Pose?.Pitch,
    roll: detail.Pose?.Roll,
  };
}

export function mapCelebrities(res: RkRecognizeCelebritiesResponse, minConfidence: number): PublicFigureResult {
  const best = [...(res.CelebrityFaces ?? [])].sort((a, b) => (b.MatchConfidence ?? 0) - (a.MatchConfidence ?? 0))[0];
  if (!best) return { isPublicFigure: false };
  const conf = best.MatchConfidence ?? 0;
  return { isPublicFigure: conf >= minConfidence, name: best.Name, confidence: clamp01(conf / 100) };
}

/* ───────────────────────── provider ───────────────────────── */

type RekognitionSdk = typeof import("@aws-sdk/client-rekognition");

export function createRekognitionFaceProvider(opts: RekognitionOptions): RekognitionFaceProvider {
  const embedder = opts.embedder ?? createLocalFaceProvider();
  const celebrityMin = opts.celebrityMinConfidence ?? DEFAULT_CELEBRITY_MIN_CONFIDENCE;
  let sdk: Promise<RekognitionSdk> | undefined;
  let client: RekognitionSender | undefined = opts.client;

  const loadSdk = () => (sdk ??= import("@aws-sdk/client-rekognition"));
  async function getClient(): Promise<RekognitionSender> {
    if (client) return client;
    const { RekognitionClient } = await loadSdk();
    client = new RekognitionClient({
      region: opts.region,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      maxAttempts: 3,
      requestHandler: { requestTimeout: 15_000, connectionTimeout: 5_000 },
    });
    return client;
  }
  async function send<T>(build: (s: RekognitionSdk) => object): Promise<T> {
    const [s, c] = await Promise.all([loadSdk(), getClient()]);
    return (await c.send(build(s))) as T;
  }
  const prepare = (bytes: Uint8Array) =>
    toUprightJpeg(bytes, { maxSide: REKOGNITION_MAX_SIDE, maxBytes: REKOGNITION_MAX_BYTES });

  /** Embed a face Rekognition found but the local detector missed, from a padded crop. */
  async function embedCrop(jpeg: Uint8Array, box: Box, width: number, height: number): Promise<number[]> {
    const padX = box.width * 0.5;
    const padY = box.height * 0.5;
    const left = Math.max(0, Math.floor(box.x - padX));
    const top = Math.max(0, Math.floor(box.y - padY));
    const right = Math.min(width, Math.ceil(box.x + box.width + padX));
    const bottom = Math.min(height, Math.ceil(box.y + box.height + padY));
    if (right - left < 16 || bottom - top < 16) return [];
    const sharp = await loadSharp();
    const crop = await sharp(jpeg).extract({ left, top, width: right - left, height: bottom - top }).jpeg().toBuffer();
    const res = await embedder.analyze(new Uint8Array(crop));
    return res.faces[0]?.embedding ?? [];
  }

  return {
    name: "rekognition",
    matchThreshold: embedder.matchThreshold,

    async analyze(bytes) {
      const img = await prepare(bytes);
      const [det, local] = await Promise.all([
        send<RkDetectFacesResponse>(
          (s) => new s.DetectFacesCommand({ Image: { Bytes: img.bytes }, Attributes: ["DEFAULT", "AGE_RANGE"] }),
        ),
        embedder.analyze(img.bytes),
      ]);
      const details = det.FaceDetails ?? [];
      const boxes = details.map((d) => ratioBoxToPixels(d.BoundingBox, img.width, img.height));
      const pairing = pairByIoU(
        boxes,
        local.faces.map((f) => f.box),
      );
      const sx = img.sourceWidth / img.width;
      const sy = img.sourceHeight / img.height;
      const faces: DetectedFace[] = [];
      for (let i = 0; i < details.length; i++) {
        const box = boxes[i];
        const embedding =
          pairing[i] >= 0 ? local.faces[pairing[i]].embedding : await embedCrop(img.bytes, box, img.width, img.height);
        const scaled = {
          x: Math.round(box.x * sx),
          y: Math.round(box.y * sy),
          width: Math.round(box.width * sx),
          height: Math.round(box.height * sy),
        };
        faces.push({ ...mapFaceDetail(details[i], scaled), embedding });
      }
      faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
      return { faces, width: img.sourceWidth, height: img.sourceHeight };
    },

    async compareFaces(source, target) {
      const [src, tgt] = await Promise.all([prepare(source), prepare(target)]);
      const res = await send<RkCompareFacesResponse>(
        (s) =>
          new s.CompareFacesCommand({
            SourceImage: { Bytes: src.bytes },
            TargetImage: { Bytes: tgt.bytes },
            SimilarityThreshold: 0,
          }),
      );
      const best = Math.max(-1, ...(res.FaceMatches ?? []).map((m) => m.Similarity ?? 0));
      return {
        similarity: best >= 0 ? clamp01(best / 100) : null,
        matchedFaces: res.FaceMatches?.length ?? 0,
        unmatchedFaces: res.UnmatchedFaces?.length ?? 0,
      };
    },

    async detectCelebrity(bytes) {
      const img = await prepare(bytes);
      const res = await send<RkRecognizeCelebritiesResponse>(
        (s) => new s.RecognizeCelebritiesCommand({ Image: { Bytes: img.bytes } }),
      );
      return mapCelebrities(res, celebrityMin);
    },
  };
}

/**
 * Celebrity check shaped like `ModerationProvider.detectPublicFigure`, so the moderation layer
 * can use RecognizeCelebrities with any moderation backend. Reuse the returned function (it
 * holds one SDK client).
 */
export function createRekognitionCelebrityDetector(
  opts: Pick<RekognitionOptions, "region" | "accessKeyId" | "secretAccessKey" | "client" | "celebrityMinConfidence">,
): (bytes: Uint8Array) => Promise<PublicFigureResult> {
  const provider = createRekognitionFaceProvider({ ...opts, embedder: unusedEmbedder });
  return (bytes) => provider.detectCelebrity(bytes);
}

/** Celebrity-only use never analyzes faces, so no local models are loaded. */
const unusedEmbedder: FaceProvider = {
  name: "none",
  matchThreshold: 1,
  analyze: () => Promise.reject(new Error("embedder not configured")),
};
