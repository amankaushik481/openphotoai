/**
 * OpenAI moderation (`omni-moderation-latest`) over plain fetch (no SDK). Free endpoint;
 * text and images (sent as base64 JPEG data URLs). Network errors, non-2xx responses and
 * malformed payloads throw so callers fail closed. Public-figure detection is not offered.
 */
import type { ModerationProvider, ModerationResult } from "../types";
import { toUprightJpeg } from "./image-decode";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
const TIMEOUT_MS = 15_000;
/** Images are downscaled before upload; moderation does not need full resolution. */
const IMAGE_MAX_SIDE = 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface OpenAIModerationOptions {
  apiKey: string;
  /** Test seam. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Override the API base (e.g. a proxy). */
  endpoint?: string;
}

/** One entry of `results` in the moderation response. */
export interface OpenAIModerationOutcome {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

/**
 * OpenAI category → our category name. Categories listed in `BLOCKING` block when OpenAI flags
 * them; plain `harassment`, `violence` and `illicit` are reported in scores but do not block on
 * their own (they fire on benign photo prompts like "boxing match" or "sword").
 */
const CATEGORY_MAP: Record<string, string> = {
  sexual: "sexual",
  "sexual/minors": "minors",
  hate: "hate",
  "hate/threatening": "hate",
  harassment: "harassment",
  "harassment/threatening": "harassment",
  "self-harm": "self_harm",
  "self-harm/intent": "self_harm",
  "self-harm/instructions": "self_harm",
  violence: "violence",
  "violence/graphic": "violence",
  illicit: "illicit",
  "illicit/violent": "illicit",
};

const BLOCKING = new Set([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
  "illicit/violent",
]);

/**
 * OpenShoot forbids sexual content outright, so sexual scores block below OpenAI's own
 * `flagged` cut-off as well.
 */
export const OPENAI_SCORE_THRESHOLDS: Readonly<Record<string, number>> = Object.freeze({
  sexual: 0.5,
  "sexual/minors": 0.1,
});

/** Pure mapping from an OpenAI moderation result to our ModerationResult. */
export function mapOpenAIModeration(outcome: OpenAIModerationOutcome): ModerationResult {
  const hits = new Set<string>();
  const triggered: string[] = [];
  for (const [category, flagged] of Object.entries(outcome.categories ?? {})) {
    if (flagged && BLOCKING.has(category)) triggered.push(category);
  }
  for (const [category, threshold] of Object.entries(OPENAI_SCORE_THRESHOLDS)) {
    const score = outcome.category_scores?.[category];
    if (typeof score === "number" && score >= threshold && !triggered.includes(category)) triggered.push(category);
  }
  for (const category of triggered) {
    hits.add(CATEGORY_MAP[category] ?? category);
    if (category === "sexual/minors") hits.add("sexual");
  }
  const scores: Record<string, number> = {};
  for (const [category, score] of Object.entries(outcome.category_scores ?? {})) {
    if (typeof score === "number") scores[category] = Math.round(score * 10_000) / 10_000;
  }
  const categories = [...hits];
  return categories.length > 0
    ? { allowed: false, categories, scores, reason: `openai: ${triggered.join(", ")}`, provider: "openai" }
    : { allowed: true, categories: [], scores, provider: "openai" };
}

function parseOutcome(body: unknown): OpenAIModerationOutcome {
  const result = (body as { results?: unknown[] } | null)?.results?.[0] as Partial<OpenAIModerationOutcome> | undefined;
  if (!result || typeof result.flagged !== "boolean" || typeof result.categories !== "object" || !result.categories) {
    throw new Error("openai moderation: malformed response");
  }
  return { flagged: result.flagged, categories: result.categories, category_scores: result.category_scores ?? {} };
}

type ModerationInput = string | { type: "image_url"; image_url: { url: string } }[];

export function createOpenAIModerationProvider(opts: OpenAIModerationOptions): ModerationProvider {
  if (!opts.apiKey) throw new Error("openai moderation: apiKey is required");
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const endpoint = opts.endpoint ?? ENDPOINT;

  async function moderate(input: ModerationInput): Promise<ModerationResult> {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`openai moderation: HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
    }
    return mapOpenAIModeration(parseOutcome(await res.json()));
  }

  return {
    name: "openai",
    checkText(text: string) {
      // Empty text is trivially allowed (the API rejects empty input).
      if (text.trim() === "") return Promise.resolve({ allowed: true, categories: [], provider: "openai" });
      return moderate(text);
    },
    async checkImage(bytes: Uint8Array) {
      const jpeg = await toUprightJpeg(bytes, { maxSide: IMAGE_MAX_SIDE, maxBytes: IMAGE_MAX_BYTES, quality: 85 });
      const url = `data:image/jpeg;base64,${Buffer.from(jpeg.bytes).toString("base64")}`;
      return moderate([{ type: "image_url", image_url: { url } }]);
    },
  };
}
