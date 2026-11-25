/**
 * Per-viewer conveniences of the create page, kept in this browser only: the last settings
 * (localStorage) and this tab's results + unsent prompt (sessionStorage), so a refresh or a trip to
 * another page doesn't throw them away. Parsing is defensive: storage can be stale, edited or
 * missing (private mode), and the page must work without it. Pure + unit-tested; the hooks that use
 * it wrap every storage access in try/catch.
 */
import { ASPECT_RATIOS, QUALITY_LEVELS, type AspectRatio, type JobDTO, type Quality } from "@/types/domain";
import { MAX_IMAGES_PER_JOB, SESSION_HISTORY_LIMIT, type CreateMode } from "./logic";

export const CREATE_SETTINGS_KEY = "openshoot:create:settings:v1";
export const CREATE_PROMPT_KEY = "openshoot:create:prompt:v1";
export const sessionResultsKey = (scope: string) => `openshoot:results:${scope}:v1`;

export interface CreateSettings {
  modelId: string;
  mode: CreateMode;
  aspectRatio: AspectRatio;
  numImages: number;
  quality: Quality;
}

const MODES: readonly CreateMode[] = ["prompt", "pack", "reference"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Valid fields of stored settings (anything unknown or out of range is dropped). */
export function parseCreateSettings(raw: string | null | undefined): Partial<CreateSettings> {
  const data = parseJson(raw);
  if (!isObject(data)) return {};
  const out: Partial<CreateSettings> = {};
  if (typeof data.modelId === "string" && /^[\w-]{1,64}$/.test(data.modelId)) out.modelId = data.modelId;
  if (MODES.includes(data.mode as CreateMode)) out.mode = data.mode as CreateMode;
  if ((ASPECT_RATIOS as readonly unknown[]).includes(data.aspectRatio)) out.aspectRatio = data.aspectRatio as AspectRatio;
  if (Number.isInteger(data.numImages) && (data.numImages as number) >= 1 && (data.numImages as number) <= MAX_IMAGES_PER_JOB) {
    out.numImages = data.numImages as number;
  }
  if ((QUALITY_LEVELS as readonly unknown[]).includes(data.quality)) out.quality = data.quality as Quality;
  return out;
}

export function serializeCreateSettings(settings: Partial<CreateSettings>): string {
  return JSON.stringify(settings);
}

/**
 * Settings to start the form with: an explicit deep link (`?model=`, `?mode=`, `?pack=`) beats what
 * was remembered, and a remembered "draft" quality only applies while free drafts are left.
 */
export function initialCreateSettings(
  stored: Partial<CreateSettings>,
  ctx: { draftsLeft: number; deepLink: { modelId?: string; mode?: CreateMode } },
): Partial<CreateSettings> {
  const out: Partial<CreateSettings> = { ...stored };
  if (ctx.deepLink.modelId) delete out.modelId;
  if (ctx.deepLink.mode) delete out.mode;
  if (out.quality === "draft" && ctx.draftsLeft <= 0) out.quality = "standard";
  return out;
}

export interface StoredEntry {
  job: JobDTO;
  title: string;
}

/** Results of this tab's session (newest first), restored after a refresh. */
export function parseSessionEntries(raw: string | null | undefined, limit = SESSION_HISTORY_LIMIT): StoredEntry[] {
  const data = parseJson(raw);
  if (!Array.isArray(data)) return [];
  const out: StoredEntry[] = [];
  for (const entry of data) {
    if (!isObject(entry) || typeof entry.title !== "string" || !isObject(entry.job)) continue;
    const job = entry.job;
    if (typeof job.id !== "string" || typeof job.status !== "string" || !Array.isArray(job.media) || !isObject(job.input)) continue;
    if (out.some((e) => e.job.id === job.id)) continue;
    out.push({ job: job as unknown as JobDTO, title: entry.title });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Newest `limit` entries. Media keep their (signed) URLs so restored cards paint at once; each card
 * refetches its job on mount, which replaces any URL that expired meanwhile.
 */
export function serializeSessionEntries(entries: readonly StoredEntry[], limit = SESSION_HISTORY_LIMIT): string {
  return JSON.stringify(entries.slice(0, limit).map(({ job, title }) => ({ title, job })));
}

/* ───────────────────────────── why Generate is disabled ───────────────────────────── */

export interface SubmitBlockInput {
  /** The user's own models (undefined while loading). */
  models: readonly { status: string; shared?: boolean }[] | undefined;
  modelId: string | null;
  quality: Quality;
  numImages: number;
  draftsLeft: number;
}

/**
 * The reason Generate can't be pressed right now, in words the user can act on (null when it can).
 * Shown next to the disabled button instead of leaving the user to guess.
 */
export function submitBlockReason(input: SubmitBlockInput): string | null {
  const own = input.models?.filter((m) => !m.shared);
  if (!input.modelId) {
    if (!own) return null; // still loading
    if (own.length === 0) return "Create your model first: it takes about 5 minutes.";
    if (own.some((m) => m.status === "training")) return "Your model is still training. We'll email you when it's ready.";
    if (!own.some((m) => m.status === "ready")) return "Finish setting up your model to start creating.";
    return "Choose a model above.";
  }
  if (input.quality === "draft" && input.draftsLeft < input.numImages) {
    if (input.draftsLeft <= 0) return "No free drafts left today: choose Standard or High.";
    return `Only ${input.draftsLeft} free ${input.draftsLeft === 1 ? "draft" : "drafts"} left today: pick ${input.draftsLeft} ${input.draftsLeft === 1 ? "photo" : "photos"} or choose Standard.`;
  }
  return null;
}
