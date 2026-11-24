/**
 * Safety records outlive a deleted account (abuse audits), but without personal data: only the
 * decision itself (categories, scores, thresholds, content hashes) is kept.
 */

/** Keys of `moderation_events.details` that describe the decision, not the person. */
const SAFE_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "stage",
  "reason",
  "source",
  "provider",
  "purpose",
  "media",
  "categories",
  "canonical",
  "score",
  "scores",
  "threshold",
  "confidence",
  "minAge",
  "age",
  "ages",
  "bytes",
  "length",
  "index",
  // sha256 of the blocked content: lets moderators spot re-uploads without keeping the content.
  "sha256",
  // Name of a detected public figure (a third party, not the deleted user).
  "name",
]);

/** Inside `details.text` (see redactTexts): the excerpt is the user's own words; the hash is not. */
const SAFE_TEXT_KEYS: ReadonlySet<string> = new Set(["sha256", "length"]);

function pick(source: Record<string, unknown>, keys: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => keys.has(key)));
}

/**
 * Allowlist-based scrub: free text (prompt excerpts, provider error messages, reasons), ids of the
 * user's deleted rows and anything unknown are dropped.
 */
export function anonymizeModerationDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = details ?? {};
  const kept = pick(source, SAFE_DETAIL_KEYS);
  const text = source.text;
  if (text && typeof text === "object" && !Array.isArray(text)) {
    kept.text = pick(text as Record<string, unknown>, SAFE_TEXT_KEYS);
  }
  kept.anonymized = true;
  return kept;
}
