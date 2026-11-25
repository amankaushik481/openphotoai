/**
 * Trained identity weights kept in OUR storage (SAF-7).
 *
 * fal has no API to delete a stored file, so a LoRA left on fal's CDN can't be removed when the user
 * deletes their model. Instead: the training output is stored on fal with a short lifecycle (1 day,
 * src/providers/ai/fal.ts), and when training completes the weights are copied into our storage under
 * the model's prefix, so deleting the model (deletePrefix) really deletes them. Generation then uses
 * our copy: a short-lived signed URL when our storage is publicly reachable, otherwise a short-lived
 * provider upload whose URL is cached in the model's metadata until shortly before it expires.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { identityModels } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import { fetchOutputBytes } from "@/providers/ai/shared/fetch-output";
import { getImageProvider } from "@/providers/registry";
import { getStorage, storageKeys } from "@/server/storage";
import type { AIProviderName } from "@/types/domain";

/** LoRA files are ~50-300 MB; anything far larger is not a LoRA. */
const WEIGHTS_MAX_BYTES = 1024 * 1024 * 1024;
const WEIGHTS_FETCH_TIMEOUT_MS = 10 * 60_000;
const WEIGHTS_CONTENT_TYPE = "application/octet-stream";
/** Signed URL lifetime when our storage is publicly reachable (the provider reads it at job start). */
const SIGNED_URL_TTL_SEC = 2 * 60 * 60;
/** Provider uploads live 1 day (fal INPUT_LIFECYCLE); reuse a cached URL only well inside that. */
const PROVIDER_URL_TTL_MS = 20 * 60 * 60 * 1000;
const PROVIDER_URL_MIN_REMAINING_MS = 60 * 60 * 1000;

/** Providers whose trained weights can't be deleted through their API (so we keep our own copy). */
const COPY_WEIGHTS_PROVIDERS: readonly AIProviderName[] = ["fal"];

export interface StoredWeights {
  key: string;
  bytes: number;
  sha256: string;
  copiedAt: string;
}

interface CachedProviderUrl {
  url: string;
  expiresAt: string;
}

export function shouldCopyWeights(provider: AIProviderName | null | undefined, modelRef: string): boolean {
  return Boolean(provider && COPY_WEIGHTS_PROVIDERS.includes(provider)) && /^https:\/\//i.test(modelRef);
}

/**
 * Storage key of a weights copy. `attempt` (the job's completion attempt) makes every attempt write its
 * own object: an attempt that lost its lease can then delete its copy without touching the one the
 * winning attempt stored (they used to share one key, and the loser's cleanup deleted the live weights).
 */
export function weightsKey(userId: string, modelId: string, jobId: string, attempt?: number): string {
  const suffix = attempt !== undefined ? `-${attempt}` : "";
  return `${storageKeys.modelPrefix(userId, modelId)}weights/${jobId}${suffix}.safetensors`;
}

/** Download the provider's weights file and store it under the model's prefix. */
export async function copyWeightsToStorage(args: {
  userId: string;
  modelId: string;
  jobId: string;
  modelRef: string;
  attempt?: number;
}): Promise<StoredWeights> {
  const { bytes } = await fetchOutputBytes(args.modelRef, { maxBytes: WEIGHTS_MAX_BYTES, timeoutMs: WEIGHTS_FETCH_TIMEOUT_MS });
  if (bytes.byteLength === 0) throw new Error("The training provider returned an empty weights file.");
  const key = weightsKey(args.userId, args.modelId, args.jobId, args.attempt);
  await getStorage().put(key, bytes, { contentType: WEIGHTS_CONTENT_TYPE });
  return {
    key,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    copiedAt: new Date().toISOString(),
  };
}

/** jsonb patch storing the weights reference in `metadata.weights` (and dropping any cached URL). */
export function setWeightsSql(weights: StoredWeights) {
  return sql`(coalesce(${identityModels.metadata}, '{}'::jsonb) - 'weightsUrl') || jsonb_build_object('weights', ${JSON.stringify(weights)}::jsonb)`;
}

export function storedWeightsOf(model: Pick<IdentityModelRow, "metadata">): StoredWeights | null {
  const raw = model.metadata?.weights;
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<StoredWeights>;
  return typeof w.key === "string" && w.key ? (w as StoredWeights) : null;
}

function cachedUrlOf(model: Pick<IdentityModelRow, "metadata">): CachedProviderUrl | null {
  const raw = model.metadata?.weightsUrl;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<CachedProviderUrl>;
  return typeof c.url === "string" && typeof c.expiresAt === "string" ? { url: c.url, expiresAt: c.expiresAt } : null;
}

/**
 * A URL the AI provider can read the model's weights from (our copy). Null when the model has no
 * stored copy (mock / Replicate / trained before copies existed): use `providerModelRef` then.
 */
export async function storedWeightsUrl(model: IdentityModelRow): Promise<string | null> {
  const weights = storedWeightsOf(model);
  if (!weights) return null;
  const storage = getStorage();
  if (storage.publiclyReachable) return storage.getSignedUrl(weights.key, { expiresInSec: SIGNED_URL_TTL_SEC });

  const cached = cachedUrlOf(model);
  if (cached && Date.parse(cached.expiresAt) - Date.now() > PROVIDER_URL_MIN_REMAINING_MS) return cached.url;

  const bytes = await storage.get(weights.key);
  const url = await getImageProvider().uploadInput(bytes, WEIGHTS_CONTENT_TYPE, "lora.safetensors");
  const entry: CachedProviderUrl = { url, expiresAt: new Date(Date.now() + PROVIDER_URL_TTL_MS).toISOString() };
  await db
    .update(identityModels)
    .set({ metadata: sql`coalesce(${identityModels.metadata}, '{}'::jsonb) || jsonb_build_object('weightsUrl', ${JSON.stringify(entry)}::jsonb)` })
    .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, model.userId)));
  return url;
}
