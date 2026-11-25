/**
 * Mock AI provider (images, training, video): zero keys, deterministic, and stateless across
 * processes — the request id and output URLs carry the job payload (./payload.ts).
 *
 * Jobs report "running" until MOCK_JOB_DELAY_MS has elapsed since submission (training 4×;
 * 0 ⇒ done immediately). Prompt directives for tests and demos:
 *   [mock:fail]         the job fails with "Mock provider failure"
 *   [mock:nsfw-output]  output images/videos carry the nsfw marker (the output classifier blocks them)
 *   [mock:unsafe-output]  same, but passes the always-on prompt filter (which blocks "nsfw"):
 *                       use this one when the prompt goes through the app (dev, e2e)
 *   [mock:stuck]        the job stays "running" forever
 *
 * Outputs keep the identity of their source (decoded from the pixel marker of inputs passed
 * through uploadInput(), or of earlier mock outputs), so mock likeness scoring stays coherent.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MOCK_COST_USD, type Capability } from "@/config/models";
import { env } from "@/lib/env";
import type { AspectRatio } from "@/types/domain";
import type {
  AIWebhookEvent,
  IdentityRef,
  ImageProvider,
  ProviderJobRef,
  ProviderJobStatus,
  ProviderOutput,
  TrainingProvider,
  VideoProvider,
} from "../types";
import { getMockInput, putMockInput } from "./input-cache";
import { decodeMarker, isMockIdentity, type Marker } from "./markers";
import {
  closestAspectRatio,
  FLAG_FAIL,
  FLAG_NSFW,
  FLAG_STUCK,
  LONG_SIDE,
  makeRequestId,
  outputSize,
  parseDirectives,
  parseMockUrl,
  parseRequestId,
  snippet,
  type MockKind,
  type MockPayload,
} from "./payload";
import { mockPromptHelper } from "./prompt-helper";
import { hash32 } from "./random";
import { MOCK_VIDEO_SECONDS, outputMarker, renderMockImage, renderMockVideo } from "./render";

export type MockAIProvider = ImageProvider & TrainingProvider & VideoProvider;

export interface MockAIProviderOptions {
  /** Clock override (tests). */
  now?: () => number;
  /** Fixed job delay in ms; defaults to env.MOCK_JOB_DELAY_MS read on every status check. */
  delayMs?: number;
}

export const MOCK_WEBHOOK_HEADER = "x-mock-signature";
export const MOCK_FAILURE_MESSAGE = "Mock provider failure";
const MAX_UPSCALE_SIDE = 2048;

const COST_CAPABILITY: Record<MockKind, Capability> = {
  gen: "generate",
  edit: "editMulti",
  pose: "editMulti",
  multi: "editMulti",
  inpaint: "inpaint",
  upscale: "upscale",
  restore: "faceRestore",
  rmbg: "removeBg",
  tryon: "tryOn",
  train: "train",
  i2v: "imageToVideo",
  talk: "talkingVideo",
};

/**
 * HMAC-SHA256 (hex) of a webhook body — the `x-mock-signature` value. The key is derived for this one
 * purpose: BETTER_AUTH_SECRET itself also HMACs session cookies, so it must never sign anything else.
 */
export function signMockWebhook(rawBody: string): string {
  const key = createHmac("sha256", env.authSecret).update("openshoot:mock-ai-webhook:v1").digest();
  return createHmac("sha256", key).update(rawBody).digest("hex");
}

export function createMockAIProvider(opts: MockAIProviderOptions = {}): MockAIProvider {
  const now = opts.now ?? Date.now;

  function submit(payload: Omit<MockPayload, "r">): ProviderJobRef {
    const full: MockPayload = { ...payload, r: randomBytes(3).toString("hex") };
    return { provider: "mock", endpoint: `mock/${payload.k}`, requestId: makeRequestId(now(), full) };
  }

  return {
    name: "mock",

    /* ───────── images ───────── */

    async submitGenerate(input) {
      const { flags, text } = promptParts(input.prompt);
      const source = await identitySource(input.identity);
      return submit({
        k: "gen",
        p: text,
        ar: input.aspectRatio,
        n: clampCount(input.numImages),
        q: input.quality,
        L: LONG_SIDE[input.quality],
        s: input.seed ?? hash32(`${input.prompt}|${now()}`) % 1_000_000,
        f: flags,
        ...identityFields(source),
      });
    },

    async submitEdit(input) {
      const { flags, text } = promptParts(input.prompt);
      const image = await sourceInfo(input.imageUrls[0]);
      let identity: SourceInfo = image;
      let faces = image.marker?.faces;
      if (input.mode === "pose_copy" && input.identity) identity = await identitySource(input.identity);
      if (input.mode === "multi_person" && input.identities?.length) {
        identity = await identitySource(input.identities[0]);
        faces = input.identities.length;
      }
      return submit({
        k: input.mode === "instruct" ? "edit" : input.mode === "pose_copy" ? "pose" : "multi",
        p: text,
        ar: input.aspectRatio ?? image.ar ?? "4:5",
        n: clampCount(input.numImages),
        q: "standard",
        L: LONG_SIDE.standard,
        s: input.seed ?? hash32(`${input.prompt}|${now()}`) % 1_000_000,
        f: flags | (image.marker?.nsfw ? FLAG_NSFW : 0),
        ...identityFields(identity, faces),
      });
    },

    async submitInpaint(input) {
      const { flags, text } = promptParts(input.prompt);
      const image = await sourceInfo(input.imageUrl);
      const identity = input.identity ? await identitySource(input.identity) : image;
      return submit(sameSizeJob("inpaint", image, flags, text, identity));
    },

    async submitUpscale(input) {
      const image = await sourceInfo(input.imageUrl);
      const job = sameSizeJob("upscale", image, 0, "");
      return submit({ ...job, q: "high", L: Math.min(MAX_UPSCALE_SIDE, (image.longSide ?? LONG_SIDE.standard) * input.scale) });
    },

    async submitFaceRestore(input) {
      return submit(sameSizeJob("restore", await sourceInfo(input.imageUrl), 0, ""));
    },

    async submitRemoveBackground(input) {
      return submit(sameSizeJob("rmbg", await sourceInfo(input.imageUrl), 0, ""));
    },

    async submitTryOn(input) {
      return submit(sameSizeJob("tryon", await sourceInfo(input.personImageUrl), 0, `Try-on (${input.category})`));
    },

    async promptHelper(input) {
      return mockPromptHelper(input);
    },

    /* ───────── training ───────── */

    async submitTraining(input) {
      const identity = await zipIdentity(input.imagesZipUrl);
      return submit({
        k: "train",
        p: "",
        ar: "1:1",
        n: 0,
        q: "standard",
        L: LONG_SIDE.standard,
        s: 0,
        f: 0,
        tw: input.triggerWord.slice(0, 40),
        ...(identity && identity !== "default" ? { id: identity } : {}),
      });
    },

    async deleteModel() {
      // Nothing is stored provider-side.
    },

    /* ───────── video ───────── */

    async submitImageToVideo(input) {
      const { flags, text } = promptParts(input.prompt);
      const image = await sourceInfo(input.imageUrl);
      return submit({
        ...sameSizeJob("i2v", image, flags, text),
        ar: input.aspectRatio ?? image.ar ?? "4:5",
        n: 1,
        d: input.durationSec,
      });
    },

    async submitTalkingVideo(input) {
      const { flags, text } = promptParts(input.script);
      const image = await sourceInfo(input.imageUrl);
      return submit({ ...sameSizeJob("talk", image, flags, text), n: 1 });
    },

    /* ───────── lifecycle ───────── */

    async getStatus(ref): Promise<ProviderJobStatus> {
      const req = parseRequestId(ref.requestId);
      if (!req) return { state: "failed", error: "Unknown mock request id", retryable: false };
      const { payload, submittedAt, encoded } = req;
      const delay = Math.max(0, opts.delayMs ?? env.MOCK_JOB_DELAY_MS) * (payload.k === "train" ? 4 : 1);
      const elapsed = Math.max(0, now() - submittedAt);

      if (payload.f & FLAG_STUCK) return { state: "running", progress: 0.5, logs: ["mock: stuck"] };
      if (elapsed < delay) {
        return { state: "running", progress: Math.round((elapsed / delay) * 100) / 100, logs: [`mock: ${payload.k} running`] };
      }
      if (payload.f & FLAG_FAIL) return { state: "failed", error: MOCK_FAILURE_MESSAGE, retryable: false };
      return { state: "succeeded", output: buildOutput(payload, encoded) };
    },

    async cancel() {
      // Mock jobs have no provider-side state to cancel.
    },

    async parseWebhook(req): Promise<AIWebhookEvent> {
      const given = (req.headers.get(MOCK_WEBHOOK_HEADER) ?? "").replace(/^sha256=/, "").trim();
      const expected = signMockWebhook(req.rawBody);
      const a = Buffer.from(given, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid mock webhook signature");

      let body: unknown;
      try {
        body = JSON.parse(req.rawBody);
      } catch {
        throw new Error("Invalid mock webhook body");
      }
      const record = (body ?? {}) as Record<string, unknown>;
      if (typeof record.requestId !== "string" || !record.requestId) throw new Error("Mock webhook is missing requestId");
      const status = typeof record.status === "string" ? record.status : "completed";
      const eventId = typeof record.eventId === "string" && record.eventId ? record.eventId : `${record.requestId}:${status}`;
      return { eventId, requestId: record.requestId };
    },

    async uploadInput(bytes, contentType) {
      return putMockInput(bytes, contentType);
    },

    async fetchOutput(url) {
      const parsed = parseMockUrl(url);
      if (!parsed) throw new Error(`Not a mock provider URL: ${url.slice(0, 80)}`);
      if (parsed.type === "input") {
        const entry = getMockInput(parsed.sha);
        if (!entry) throw new Error("Mock input is no longer cached");
        return { bytes: new Uint8Array(entry.bytes), contentType: entry.contentType };
      }
      if (parsed.type === "video") {
        return { bytes: await renderMockVideo(parsed.payload, parsed.encoded), contentType: "video/mp4" };
      }
      return { bytes: await renderMockImage(parsed.payload, parsed.index), contentType: "image/png" };
    },
  };
}

/** Estimated (pseudo) provider cost of a mock job in USD, from MOCK_COST_USD. */
export function mockCostUsd(kind: MockKind, outputs = 1): number {
  const unit = MOCK_COST_USD[COST_CAPABILITY[kind]];
  const perImage = kind !== "train" && kind !== "i2v" && kind !== "talk";
  return Math.round(unit * (perImage ? Math.max(1, outputs) : 1) * 10_000) / 10_000;
}

/* ───────────── outputs ───────────── */

function buildOutput(payload: MockPayload, encoded: string): ProviderOutput {
  const raw = { mock: true, kind: payload.k, costUsd: mockCostUsd(payload.k, payload.n) };
  if (payload.k === "train") {
    return { modelRef: `mock-lora://${payload.tw ?? "model"}${payload.id ? `#${payload.id}` : ""}`, raw };
  }
  if (payload.k === "i2v" || payload.k === "talk") {
    return { videos: [{ url: `mock://video/${encoded}/0`, durationSec: MOCK_VIDEO_SECONDS, contentType: "video/mp4" }], raw };
  }
  const { width, height } = outputSize(payload.ar, payload.L);
  return {
    images: Array.from({ length: payload.n }, (_, i) => ({
      url: `mock://image/${encoded}/${i}`,
      width,
      height,
      contentType: "image/png",
      seed: payload.s + i,
    })),
    seed: payload.s,
    raw,
  };
}

/* ───────────── inputs ───────────── */

interface SourceInfo {
  marker: Marker | null;
  ar?: AspectRatio;
  longSide?: number;
  /** Caption + seed of a mock output source, so derived images keep its composition. */
  text?: string;
  seed?: number;
}

function promptParts(prompt: string): { flags: number; text: string } {
  const { flags, clean } = parseDirectives(prompt);
  return { flags, text: snippet(clean) };
}

function clampCount(n: number): number {
  return Math.max(1, Math.min(8, Math.round(n) || 1));
}

function identityFields(source: SourceInfo, faces?: number): Pick<MockPayload, "id" | "fc"> {
  const id = source.marker?.identity;
  const fc = faces ?? 1;
  return {
    ...(id && id !== "default" ? { id } : {}),
    ...(fc !== 1 ? { fc: Math.max(0, Math.min(4, fc)) } : {}),
  };
}

/** Jobs whose output mirrors one source image (size, identity, nsfw state). */
function sameSizeJob(kind: MockKind, image: SourceInfo, flags: number, text: string, identity: SourceInfo = image): Omit<MockPayload, "r"> {
  return {
    k: kind,
    p: text || image.text || "",
    ar: image.ar ?? "4:5",
    n: 1,
    q: "standard",
    L: Math.min(MAX_UPSCALE_SIDE, image.longSide ?? LONG_SIDE.standard),
    s: image.seed ?? 0,
    f: flags | (image.marker?.nsfw ? FLAG_NSFW : 0),
    ...identityFields(identity, image.marker?.faces),
  };
}

/** Identity of a model: its reference photos when available, else the `#identity` suffix of a mock modelRef. */
async function identitySource(ref: IdentityRef): Promise<SourceInfo> {
  for (const url of ref.referenceImageUrls ?? []) {
    const info = await sourceInfo(url);
    if (info.marker) return { marker: { ...info.marker, faces: 1, nsfw: false } };
  }
  const suffix = /^mock-lora:\/\/[^#]*#([a-z]+)$/.exec(ref.modelRef)?.[1];
  if (suffix && isMockIdentity(suffix)) {
    return { marker: { identity: suffix, age: 30, faces: 1, nsfw: false, blurry: false, publicFigure: false } };
  }
  return { marker: null };
}

/** What the mock can learn about an input URL without network access. */
async function sourceInfo(url: string | undefined): Promise<SourceInfo> {
  const parsed = url ? parseMockUrl(url) : null;
  if (!parsed) return { marker: null };
  if (parsed.type !== "input") {
    const p = parsed.payload;
    return { marker: outputMarker(p), ar: p.ar, longSide: p.L, text: p.p, seed: p.s + parsed.index };
  }
  const entry = getMockInput(parsed.sha);
  if (!entry) return { marker: null };
  const seed = Number.parseInt(parsed.sha.slice(0, 8), 16) % 1_000_000;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(entry.bytes).metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    return {
      marker: await decodeMarker(entry.bytes),
      ar: width && height ? closestAspectRatio(width, height) : undefined,
      longSide: width && height ? Math.max(width, height) : undefined,
      seed,
    };
  } catch {
    return { marker: null, seed };
  }
}

/** Identity of the first marked photo inside a training zip uploaded via uploadInput(). */
async function zipIdentity(url: string): Promise<string | null> {
  const parsed = parseMockUrl(url);
  if (!parsed || parsed.type !== "input") return null;
  const entry = getMockInput(parsed.sha);
  if (!entry) return null;
  try {
    const { unzipSync } = await import("fflate");
    const files = unzipSync(entry.bytes, { filter: (f) => /\.(jpe?g|png|webp)$/i.test(f.name) });
    for (const bytes of Object.values(files)) {
      const marker = await decodeMarker(bytes);
      if (marker) return marker.identity;
    }
  } catch {
    // Not a zip — no identity.
  }
  return null;
}
