/**
 * Pure helpers for the generation UI (create page, in-app packs, batches). No React and no server
 * imports, so they are safe in client components and unit-tested in tests/unit/create.
 */
import type { z } from "zod";
import {
  CREDIT_COSTS,
  DRAFT_DAILY_LIMIT,
  DRAFT_DAILY_LIMIT_FREE,
  INSTANT_MODE_MULTIPLIER,
} from "@/config/credits";
import { getPlan } from "@/config/plans";
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type AspectRatio,
  type BatchDTO,
  type JobDTO,
  type MediaDTO,
  type PlanId,
  type Quality,
  type generateJobInput,
} from "@/types/domain";
import { PACK_CATEGORIES, type PackCategory, type PackSummary } from "@/types/pack";

/* ───────────────────────────── types + limits ───────────────────────────── */

export type IdentityMode = "instant" | "trained";
export type CreateMode = "prompt" | "pack" | "reference";
export type BatchQuality = "standard" | "high";

/** Request body for a `generate` job (defaults filled in by the server). */
export type GenerateRequestBody = z.input<typeof generateJobInput>;

/** `GET /api/packs/:slug`: the public summary plus shot titles (never the prompts themselves). */
export interface PackDetail extends PackSummary {
  defaultAspectRatio: AspectRatio;
  prompts: { title: string }[];
}

/** Mirrors the generate job schema in src/types/domain.ts. */
export const PROMPT_MAX_LENGTH = 1500;
/** Mirrors the request limits of POST /api/prompt-helper. */
export const PROMPT_HELPER_MIN_LENGTH = 3;
export const PROMPT_HELPER_MAX_LENGTH = 500;
export const MAX_IMAGES_PER_JOB = 4;
/** Jobs kept in the create page's session history. */
export const SESSION_HISTORY_LIMIT = 12;

/* ───────────────────────────── credits ───────────────────────────── */

/** Credits per image for a quality level (mirrors `creditCost` in src/config/credits.ts). */
export function perImageCredits(quality: Quality): number {
  if (quality === "draft") return CREDIT_COSTS.generateDraft;
  return quality === "high" ? CREDIT_COSTS.generateHigh : CREDIT_COSTS.generateStandard;
}

/** Instant (reference-based) models cost INSTANT_MODE_MULTIPLIER× (the generate handler's JobPlan.credits). */
export function modeMultiplier(mode: IdentityMode | undefined): number {
  return mode === "instant" ? INSTANT_MODE_MULTIPLIER : 1;
}

/** What one generate job will charge: `creditCost(input)` × instant multiplier, like the server. */
export function generateCost(opts: {
  quality: Quality;
  numImages: number;
  /** Re-rendering a draft always makes exactly one image. */
  fromDraft?: boolean;
  mode?: IdentityMode;
}): number {
  const images = opts.fromDraft ? 1 : clampCount(opts.numImages);
  return perImageCredits(opts.quality) * images * modeMultiplier(opts.mode);
}

/** A batch is `count` one-image generate jobs, each charged like a single generate job. */
export function batchCost(opts: { count: number; quality: BatchQuality; mode?: IdentityMode }): number {
  return Math.max(0, Math.trunc(opts.count)) * generateCost({ quality: opts.quality, numImages: 1, mode: opts.mode });
}

/** "10 photos × 1 credit × 2 (instant model) = 20 credits". */
export function costBreakdown(opts: { count: number; quality: BatchQuality; mode?: IdentityMode }): string {
  const per = perImageCredits(opts.quality);
  const parts = [`${opts.count} ${plural(opts.count, "photo")}`, `${per} ${plural(per, "credit")}`];
  if (opts.mode === "instant") parts.push(`${INSTANT_MODE_MULTIPLIER} (instant model)`);
  const total = batchCost(opts);
  return `${parts.join(" × ")} = ${total} ${plural(total, "credit")}`;
}

/** Daily free-draft allowance (matches the draftsPerDay / draftsPerDayFree rate limits). */
export function draftDailyLimit(hasPaid: boolean): number {
  return hasPaid ? DRAFT_DAILY_LIMIT : DRAFT_DAILY_LIMIT_FREE;
}

export function clampCount(n: number, max = MAX_IMAGES_PER_JOB): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, Math.round(n)));
}

export function maxBatchFor(plan: PlanId): number {
  return getPlan(plan).limits.maxBatch;
}

export function clampBatchSize(n: number, plan: PlanId): number {
  return clampCount(n, maxBatchFor(plan));
}

/** Quick-pick sizes for the batch slider, capped by the plan. */
export function batchPresets(plan: PlanId): number[] {
  const max = maxBatchFor(plan);
  return [...new Set([5, 10, 25, 50].filter((n) => n < max).concat(max))];
}

/**
 * Identity mode of a model. Prefers an explicit `mode` on the DTO, then the server-provided map,
 * then a heuristic: a ready model that never had a training job is an instant model.
 */
export function resolveIdentityMode(
  model: { id: string; status?: string; trainingJobId?: string | null; mode?: unknown } | null | undefined,
  known?: Readonly<Record<string, IdentityMode>>,
): IdentityMode | undefined {
  if (!model) return undefined;
  if (model.mode === "instant" || model.mode === "trained") return model.mode;
  const fromServer = known?.[model.id];
  if (fromServer) return fromServer;
  if (model.status === "ready") return model.trainingJobId ? "trained" : "instant";
  return undefined;
}

/**
 * Identity mode per model id from `IdentityModelDTO.mode` (or, for DTOs without it, the
 * `resolveIdentityMode` fallbacks), on top of `fallback`.
 */
export function modelModesFrom(
  models: readonly { id: string; status?: string; trainingJobId?: string | null; mode?: unknown }[] | undefined,
  fallback?: Readonly<Record<string, IdentityMode>>,
): Record<string, IdentityMode> {
  const modes: Record<string, IdentityMode> = { ...fallback };
  for (const model of models ?? []) {
    const mode = resolveIdentityMode(model, fallback);
    if (mode) modes[model.id] = mode;
  }
  return modes;
}

/* ───────────────────────────── requests ───────────────────────────── */

export interface CreateFormState {
  mode: CreateMode;
  modelId: string | null;
  prompt: string;
  packId: string | null;
  /** Specific pack shot; null = let the server pick. */
  packPromptIndex: number | null;
  referenceUploadId: string | null;
  aspectRatio: AspectRatio;
  numImages: number;
  quality: Quality;
  /** Raw seed input ("" = random). */
  seed: string;
  brandKitId: string | null;
}

export type BuildResult = { ok: true; body: GenerateRequestBody } | { ok: false; message: string };

/** Validate the form and build the POST /api/jobs body for the selected mode. */
export function buildGenerateRequest(state: CreateFormState): BuildResult {
  if (!state.modelId) return { ok: false, message: "Choose an identity model first." };
  const prompt = state.prompt.trim();
  if (prompt.length > PROMPT_MAX_LENGTH) {
    return { ok: false, message: `Keep the prompt under ${PROMPT_MAX_LENGTH} characters.` };
  }

  const seed = parseSeed(state.seed);
  if (seed === "invalid") return { ok: false, message: "The seed must be a whole number between 0 and 2147483647." };

  const body: GenerateRequestBody = {
    type: "generate",
    modelId: state.modelId,
    quality: state.quality,
    numImages: clampCount(state.numImages),
    aspectRatio: state.aspectRatio,
    ...(seed !== null ? { seed } : {}),
    ...(state.brandKitId ? { brandKitId: state.brandKitId } : {}),
  };

  switch (state.mode) {
    case "prompt":
      if (!prompt) return { ok: false, message: "Describe the photo you want." };
      return { ok: true, body: { ...body, prompt } };
    case "pack":
      if (!state.packId) return { ok: false, message: "Pick a photo pack." };
      return {
        ok: true,
        body: {
          ...body,
          packId: state.packId,
          ...(state.packPromptIndex !== null ? { packPromptIndex: state.packPromptIndex } : {}),
          ...(prompt ? { prompt } : {}),
        },
      };
    case "reference":
      if (!state.referenceUploadId) return { ok: false, message: "Upload a reference photo first." };
      if (!prompt) return { ok: false, message: "Describe the scene you want in the reference's style." };
      return { ok: true, body: { ...body, prompt, referenceUploadId: state.referenceUploadId } };
  }
}

const MAX_SEED = 2_147_483_647;

/** "" -> null (random); a valid integer -> number; anything else -> "invalid". */
export function parseSeed(raw: string): number | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "invalid";
  const n = Number(s);
  return Number.isSafeInteger(n) && n <= MAX_SEED ? n : "invalid";
}

/** Re-render a draft at full quality (same prompt + seed, one image). */
export function fullQualityRequest(
  draft: Pick<MediaDTO, "id" | "modelId">,
  fallbackModelId: string | null | undefined,
  quality: BatchQuality = "standard",
): GenerateRequestBody | null {
  const modelId = draft.modelId ?? fallbackModelId;
  if (!modelId) return null;
  return { type: "generate", modelId, fromDraftMediaId: draft.id, quality, numImages: 1 };
}

/** One `Idempotency-Key` per click (randomUUID needs a secure context, so fall back to getRandomValues). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ───────────────────────────── prompt helper ───────────────────────────── */

export type SuggestionAction =
  | { kind: "append"; text: string; label: string }
  | { kind: "replace"; text: string; label: string }
  | { kind: "tip"; text: string; label: string };

const QUOTED = /["“]([^"”]{2,120})["”]/;

/**
 * Prompt-helper suggestions are either tips ("Describe the outfit, e.g. "a navy blazer"") or whole
 * alternative prompts. Tips with a quoted example append that example; prompt-shaped suggestions
 * replace the prompt; other tips are shown as plain hints.
 */
export function classifySuggestion(raw: string): SuggestionAction {
  const text = raw.replace(/\s+/g, " ").trim();
  const quoted = QUOTED.exec(text)?.[1]?.trim();
  if (quoted) return { kind: "append", text: quoted, label: `+ ${quoted}` };
  const commas = (text.match(/,/g) ?? []).length;
  if (text.includes("{subject}") || (commas >= 2 && text.length >= 40)) {
    return { kind: "replace", text, label: truncate(text, 60) };
  }
  return { kind: "tip", text, label: text };
}

/** Append a phrase to a prompt with a single comma separator. */
export function appendToPrompt(prompt: string, phrase: string): string {
  const base = prompt.trim().replace(/[\s,.;]+$/, "");
  const extra = phrase.trim().replace(/^[\s,.;]+/, "");
  if (!extra) return base;
  if (!base) return extra;
  if (base.toLowerCase().includes(extra.toLowerCase())) return base;
  return `${base}, ${extra}`;
}

/** Push onto an undo stack, skipping consecutive duplicates and keeping the newest `limit` entries. */
export function pushHistory(stack: readonly string[], value: string, limit = 10): string[] {
  if (stack[stack.length - 1] === value) return [...stack];
  return [...stack, value].slice(-limit);
}

/* ───────────────────────────── results ───────────────────────────── */

type Rankable = Pick<MediaDTO, "hidden" | "scores" | "createdAt">;

/** Visible before hidden, then best `scores.overall` first (unscored last), then oldest first. */
export function compareBestShots(a: Rankable, b: Rankable): number {
  if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
  const sa = a.scores?.overall ?? -1;
  const sb = b.scores?.overall ?? -1;
  if (sa !== sb) return sb - sa;
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortBestShots<T extends Rankable>(media: readonly T[]): T[] {
  return [...media].sort(compareBestShots);
}

/** Best shots (shown by default) vs weaker ones the best-shots picker hid ("Show N more"). */
export function splitBestShots<T extends Rankable>(media: readonly T[]): { shown: T[]; hidden: T[] } {
  const sorted = sortBestShots(media);
  return { shown: sorted.filter((m) => !m.hidden), hidden: sorted.filter((m) => m.hidden) };
}

/** All media of a set of jobs (e.g. a batch), de-duplicated and ranked best-first. */
export function collectJobMedia(jobs: readonly Pick<JobDTO, "media">[]): MediaDTO[] {
  const byId = new Map<string, MediaDTO>();
  for (const job of jobs) for (const m of job.media) byId.set(m.id, m);
  return sortBestShots([...byId.values()]);
}

/** Images a generate job is expected to produce (for placeholders while it runs). */
export function expectedImages(job: Pick<JobDTO, "input">): number {
  const input = job.input;
  if (input.type !== "generate") return 1;
  return input.fromDraftMediaId ? 1 : clampCount(input.numImages);
}

/** Screen-reader announcement for a job's state. */
export function jobAnnouncement(
  job: Pick<JobDTO, "status" | "progress" | "media" | "blockedCount" | "creditsRefunded">,
  label = "Your photos",
): string {
  switch (job.status) {
    case "queued":
      return `${label}: queued.`;
    case "running":
      return `${label}: generating, ${Math.max(0, Math.min(100, Math.round(job.progress)))}% done.`;
    case "succeeded": {
      const n = job.media.length;
      const hidden = job.media.filter((m) => m.hidden).length;
      const blocked = job.blockedCount > 0 ? ` ${job.blockedCount} blocked by the safety filter.` : "";
      const hiddenNote = hidden > 0 ? ` ${hidden} weaker ${plural(hidden, "shot")} hidden.` : "";
      return `${label}: ${n} ${plural(n, "photo")} ready, best shots first.${hiddenNote}${blocked}`;
    }
    case "blocked":
      return `${label}: blocked by the safety filter. Credits refunded.`;
    case "canceled":
      return `${label}: canceled.`;
    case "failed":
      return `${label}: failed.${job.creditsRefunded > 0 ? " Credits refunded." : ""}`;
  }
}

/* ───────────────────────────── batches ───────────────────────────── */

export interface BatchProgress {
  total: number;
  /** Finished jobs (succeeded + failed). */
  done: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  percent: number;
  refunded: number;
  photos: number;
}

export function batchProgress(
  batch: Pick<BatchDTO, "total" | "completed" | "failed">,
  jobs: readonly Pick<JobDTO, "status" | "creditsRefunded" | "media">[],
): BatchProgress {
  const total = Math.max(batch.total, 0);
  const done = Math.min(total, batch.completed + batch.failed);
  const inFlight = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  return {
    total,
    done,
    succeeded: batch.completed,
    failed: batch.failed,
    inFlight,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    refunded: jobs.reduce((sum, j) => sum + (j.creditsRefunded || 0), 0),
    photos: jobs.reduce((sum, j) => sum + j.media.length, 0),
  };
}

/**
 * Live-region text for batch progress, bucketed to ~10% steps: the text (and so the announcement)
 * only changes at each step and on completion, so screen readers aren't flooded by every poll.
 */
export function batchAnnouncement(p: BatchProgress, terminal: boolean): string {
  if (terminal) {
    const failed =
      p.failed > 0
        ? ` ${p.failed} failed and ${p.refunded} ${plural(p.refunded, "credit was", "credits were")} refunded.`
        : "";
    return `Batch finished: ${p.photos} ${plural(p.photos, "photo")} ready.${failed}`;
  }
  const step = Math.max(1, Math.ceil(p.total / 10));
  const bucket = Math.min(p.done, Math.floor(p.done / step) * step);
  return `${bucket} of ${p.total} done.`;
}

/** `attachment; filename="x.zip"` (or RFC 5987 `filename*=`) -> "x.zip"; falls back when absent/unsafe. */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)?.[1];
  let name: string | undefined;
  if (star) {
    try {
      name = decodeURIComponent(star.trim());
    } catch {
      name = undefined;
    }
  }
  name ??= /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim();
  const safe = name?.replace(/[/\\]/g, "_").replace(/[\u0000-\u001f]/g, "").trim();
  return safe || fallback;
}

/* ───────────────────────────── packs ───────────────────────────── */

export const PACK_CATEGORY_LABELS: Record<PackCategory, string> = {
  professional: "Professional",
  dating: "Dating",
  lifestyle: "Lifestyle",
  travel: "Travel",
  fashion: "Fashion",
  fitness: "Fitness",
  events: "Events",
  seasonal: "Seasonal",
  creative: "Creative",
  family: "Family",
};

/** Categories that actually have packs, in canonical order. */
export function packCategoriesIn(packs: readonly Pick<PackSummary, "category">[]): PackCategory[] {
  const present = new Set(packs.map((p) => p.category));
  return PACK_CATEGORIES.filter((c) => present.has(c));
}

export function isPackCategory(value: unknown): value is PackCategory {
  return typeof value === "string" && (PACK_CATEGORIES as readonly string[]).includes(value);
}

/** Case/accent-insensitive search over name, tagline, tags, category and shot titles (all words must match). */
export function filterPacks<T extends PackSummary>(
  packs: readonly T[],
  opts: { query?: string; category?: PackCategory | "all" | null },
): T[] {
  const words = normalize(opts.query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return packs.filter((p) => {
    if (opts.category && opts.category !== "all" && p.category !== opts.category) return false;
    if (words.length === 0) return true;
    const haystack = normalize(
      [p.name, p.tagline, p.category, PACK_CATEGORY_LABELS[p.category], ...p.tags, ...p.sampleTitles].join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
}

/* ───────────────────────────── errors ───────────────────────────── */

export interface FriendlyError {
  code: ApiErrorCode | "network";
  title: string;
  message: string;
  /** Extra context (e.g. the content policy in plain words). */
  hint?: string;
  action?: { label: string; href: string };
  retryAfterSec?: number;
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

const CONTENT_POLICY =
  "We never create sexual or nude content, images of minors, real public figures or celebrities, or violent and hateful scenes — and only of people who consented. Rephrase your request and try again.";

function isErrorCode(code: unknown): code is ApiErrorCode | "network" {
  return code === "network" || (typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code));
}

function detailNumber(details: unknown, key: string): number | undefined {
  if (!details || typeof details !== "object") return undefined;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** "45 seconds" | "3 minutes" | "2 hours" (rounded up). */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} ${plural(s, "second")}`;
  if (s < 3600) {
    const m = Math.ceil(s / 60);
    return `${m} ${plural(m, "minute")}`;
  }
  const h = Math.ceil(s / 3600);
  return `${h} ${plural(h, "hour")}`;
}

/** Map any thrown value (usually ApiClientError) to friendly copy + a next step. */
export function describeApiError(err: unknown, ctx: { draft?: boolean; nextPath?: string } = {}): FriendlyError {
  const e: ErrorLike = err && typeof err === "object" ? (err as ErrorLike) : {};
  const code = isErrorCode(e.code) ? e.code : "internal";
  const serverMessage = typeof e.message === "string" && e.message.trim() ? e.message.trim() : undefined;

  switch (code) {
    case "insufficient_credits": {
      const needed = detailNumber(e.details, "needed");
      const balance = detailNumber(e.details, "balance");
      return {
        code,
        title: "Not enough credits",
        message:
          needed !== undefined && balance !== undefined
            ? `This needs ${needed} ${plural(needed, "credit")} and you have ${balance}. Free drafts don't use credits.`
            : (serverMessage ?? "You don't have enough credits for this."),
        action: { label: "Buy credits", href: "/app/billing" },
      };
    }
    case "content_blocked":
      return {
        code,
        title: "Blocked by our safety rules",
        message: serverMessage ?? "This request was blocked by our safety filter.",
        hint: CONTENT_POLICY,
        action: { label: "Read the content policy", href: "/legal/acceptable-use" },
      };
    case "rate_limited": {
      const retryAfterSec = detailNumber(e.details, "retryAfterSec");
      const wait = retryAfterSec !== undefined ? ` in ${formatWait(retryAfterSec)}` : " later";
      return ctx.draft
        ? {
            code,
            title: "Today's free drafts are used up",
            message: `Switch to Standard quality to keep going, or come back${wait} for more free drafts.`,
            retryAfterSec,
          }
        : {
            code,
            title: "You're going a bit fast",
            message: `Please try again${wait}.`,
            retryAfterSec,
          };
    }
    case "plan_limit":
      return {
        code,
        title: "Plan limit reached",
        message: serverMessage ?? "Your plan doesn't include this.",
        action: { label: "See plans", href: "/app/billing" },
      };
    case "validation_error":
      return { code, title: "Check your settings", message: serverMessage ?? "Some details need fixing." };
    case "conflict":
      return { code, title: "Not ready yet", message: serverMessage ?? "This changed in the meantime. Refresh and try again." };
    case "not_found":
      return { code, title: "Not found", message: serverMessage ?? "We couldn't find that. It may have been deleted." };
    case "consent_required":
      return {
        code,
        title: "Consent needed",
        message: serverMessage ?? "This model needs a verified consent selfie first.",
        action: { label: "Open your models", href: "/app/models" },
      };
    case "unauthorized":
      return {
        code,
        title: "You're signed out",
        message: "Sign in again to continue.",
        action: { label: "Sign in", href: `/login?next=${encodeURIComponent(ctx.nextPath ?? "/app/create")}` },
      };
    case "forbidden":
      return { code, title: "No access", message: serverMessage ?? "You don't have access to this." };
    case "suspended":
      return {
        code,
        title: "Account suspended",
        message: serverMessage ?? "Your account is suspended.",
        action: { label: "Learn more", href: "/suspended" },
      };
    case "payload_too_large":
      return { code, title: "File too large", message: serverMessage ?? "That file is too large." };
    case "provider_error":
      return {
        code,
        title: "The AI provider had a hiccup",
        message: serverMessage ?? "Please try again in a moment. Any credits charged were refunded.",
      };
    case "network":
      return { code, title: "You're offline", message: "Check your connection and try again." };
    case "internal":
      return { code, title: "Something went wrong", message: "Please try again. If it keeps happening, contact support." };
  }
}

/* ───────────────────────────── utils ───────────────────────────── */

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
