/** Prompt / instruction / script gate: rule filter first, then the moderation provider. Fails closed. */
import { errors } from "@/server/http";
import type { SafetyContext } from "./context";
import { errorMessage, recordBlock, redactTexts } from "./events";
import { canonicalCategory, textBlockedMessage } from "./policy";
import { moderateText, type Classification } from "./providers";
import { classifyTexts } from "./text-filter";

/**
 * Check user-provided text (prompts, edit instructions, scripts). Throws
 * AppError("content_blocked") with a human message when blocked, after recording an event.
 */
export async function assertTextAllowed(texts: string[], ctx: SafetyContext): Promise<void> {
  const items = [...new Set(texts.filter((t): t is string => typeof t === "string").map((t) => t.trim()))].filter(Boolean);
  if (items.length === 0) return;

  const rules = classifyTexts(items);
  if (!rules.allowed) {
    await block(ctx, items, rules.categories, { source: "rules", matches: rules.matches });
  }

  let results: Classification[];
  try {
    results = await Promise.all(items.map((t) => moderateText(t)));
  } catch (err) {
    await block(ctx, items, ["moderation_error"], { source: "provider", error: errorMessage(err) });
  }
  const flagged = results.filter((r) => r.blocked);
  if (flagged.length > 0) {
    await block(ctx, items, [...new Set(flagged.flatMap((r) => r.categories))], {
      source: "provider",
      provider: flagged[0]!.providerName,
      reasons: flagged.map((r) => r.result.reason).filter(Boolean),
      scores: flagged.map((r) => r.result.scores ?? {}),
    });
  }
}

async function block(
  ctx: SafetyContext,
  texts: string[],
  categories: readonly string[],
  extra: Record<string, unknown>,
): Promise<never> {
  const canonical = [...new Set(categories.map(canonicalCategory))];
  const kind = canonical.every((c) => c === "public_figure") ? "public_figure" : "prompt_blocked";
  await recordBlock(kind, ctx, { ...extra, categories: [...categories], canonical, text: redactTexts(texts) });
  throw errors.contentBlocked(textBlockedMessage(categories), { categories: canonical });
}
