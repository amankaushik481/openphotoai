/**
 * API keys for the public API (`Authorization: Bearer os_live_...`).
 * Only the SHA-256 of a key is stored; the key itself is shown once at creation.
 */
import { createHash } from "node:crypto";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import type { ApiKeyRow, UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { errors } from "@/server/http";
import type { ApiKeyScope } from "@/types/domain";

export const API_KEY_PREFIX = "os_live_";
/** Characters of the key kept in clear for display, e.g. "os_live_ab12". */
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;
export const MAX_ACTIVE_API_KEYS = 10;

export type { ApiKeyDTO } from "@/types/domain";
import type { ApiKeyDTO } from "@/types/domain";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${newToken(32)}`;
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length;
}

export function toApiKeyDTO(row: ApiKeyRow): ApiKeyDTO {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function planHasApiAccess(u: Pick<UserRow, "plan">): boolean {
  return getPlan(u.plan).limits.apiAccess;
}

/** Scopes a key can be created with: `*` (everything), `read` (GET endpoints), `generate` (jobs/batches). */
export const API_KEY_SCOPES = ["*", "read", "generate"] as const satisfies readonly ApiKeyScope[];

/** Deduplicated, ordered scopes; `*` absorbs everything else. Empty → `["*"]`. */
export function normalizeApiKeyScopes(scopes: readonly ApiKeyScope[] | undefined): ApiKeyScope[] {
  if (!scopes?.length || scopes.includes("*")) return ["*"];
  return API_KEY_SCOPES.filter((s) => scopes.includes(s));
}

export async function createApiKey(
  userId: string,
  name: string,
  scopes?: readonly ApiKeyScope[],
): Promise<{ key: string; row: ApiKeyRow }> {
  const key = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      prefix: key.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
      keyHash: hashApiKey(key),
      scopes: normalizeApiKeyScopes(scopes),
    })
    .returning();
  return { key, row: row! };
}

/** Active (non-revoked) keys of a user, newest first. */
export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function countActiveApiKeys(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  return row?.n ?? 0;
}

/** Throws plan_limit when the plan has no API access or the user already has the max number of keys. */
export async function assertCanCreateApiKey(u: Pick<UserRow, "id" | "plan">): Promise<void> {
  if (!planHasApiAccess(u)) {
    throw errors.planLimit("API access is included in the Pro and Studio plans. Upgrade to create API keys.");
  }
  if ((await countActiveApiKeys(u.id)) >= MAX_ACTIVE_API_KEYS) {
    throw errors.planLimit(`You can have at most ${MAX_ACTIVE_API_KEYS} active API keys. Revoke one first.`);
  }
}

/** Revoke one of the user's keys. Returns null when it doesn't exist, isn't theirs, or is already revoked. */
export async function revokeApiKey(userId: string, id: string): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning();
  return row ?? null;
}

/** Active key row for a presented key, or null. */
export async function findActiveApiKey(key: string): Promise<ApiKeyRow | null> {
  if (!looksLikeApiKey(key)) return null;
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}
