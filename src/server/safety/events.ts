/** moderation_events writer + redaction helpers. */
import { createHash } from "node:crypto";
import { db } from "@/db";
import { moderationEvents } from "@/db/schema";
import type { ModerationEventKind } from "@/types/domain";
import type { SafetyContext } from "./context";
import { SAFETY_POLICY } from "./policy";

/** Record a safety decision in moderation_events. */
export async function recordModerationEvent(
  kind: ModerationEventKind,
  ctx: SafetyContext,
  details: Record<string, unknown>,
): Promise<void> {
  await db.insert(moderationEvents).values({
    userId: ctx.userId,
    jobId: ctx.jobId ?? null,
    modelId: ctx.modelId ?? null,
    kind,
    details,
  });
}

/**
 * Record an event without letting a logging failure change the safety decision (the caller
 * still blocks). Failures are logged loudly so operators notice a broken audit trail.
 */
export async function recordBlock(
  kind: ModerationEventKind,
  ctx: SafetyContext,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await recordModerationEvent(kind, ctx, details);
  } catch (err) {
    console.error(`[safety] failed to record moderation event "${kind}":`, err instanceof Error ? err.message : err);
  }
}

/** What we keep of blocked user text: a short excerpt for reviewers and a hash for correlation. */
export function redactTexts(texts: readonly string[]): { excerpt: string; sha256: string; length: number } {
  const joined = texts.join("\n");
  const flat = joined.replace(/\s+/g, " ").trim();
  const max = SAFETY_POLICY.maxLoggedTextChars;
  const excerpt = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return { excerpt, sha256: createHash("sha256").update(joined).digest("hex"), length: joined.length };
}

/** sha256 of binary content (lets admins correlate repeated uploads without storing them). */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Error message safe to store (no stack traces). */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}
