/**
 * Account-deletion report: stored in `deletion_requests.report` so a failed deletion can be resumed
 * (finished steps are skipped) and operators can audit what happened.
 */

/** Executed in this order. Best-effort steps record problems as warnings and never block. */
export const DELETION_STEPS = ["lock", "jobs", "subscriptions", "models", "records", "storage"] as const;
export type DeletionStepName = (typeof DELETION_STEPS)[number];

export interface DeletionStepResult {
  status: "done" | "failed";
  at: string;
  /** Counters for the step (e.g. `{ canceled: 1 }`). */
  counts?: Record<string, number>;
  /** Blocking error (status "failed"). */
  error?: string;
}

/** What the user had, counted before anything is removed (shown in the final email). */
export interface DeletionSummary {
  identityModels: number;
  trainingPhotos: number;
  media: number;
  uploads: number;
  jobs: number;
  shareLinks: number;
  subscriptions: number;
}

/** A type alias (not an interface) so it's assignable to the jsonb column's Record type. */
export type DeletionReport = {
  version: 1;
  startedAt: string;
  attempts: number;
  lastAttemptAt: string;
  finishedAt?: string;
  summary?: DeletionSummary;
  steps: Partial<Record<DeletionStepName, DeletionStepResult>>;
  /** Non-blocking problems (e.g. a subscription the payment provider refused to cancel). */
  warnings: string[];
  /** Last blocking error; cleared when a retry succeeds. */
  error?: string;
  /** A deletion run holds this lease so concurrent confirmations don't run it twice. */
  leaseUntil?: string | null;
};

const MAX_WARNINGS = 50;

export function newDeletionReport(now: Date): DeletionReport {
  const iso = now.toISOString();
  return { version: 1, startedAt: iso, attempts: 0, lastAttemptAt: iso, steps: {}, warnings: [] };
}

/** Accepts whatever is stored in the jsonb column (null, a lease-only object, a full report). */
export function parseDeletionReport(raw: unknown): DeletionReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<DeletionReport>;
  if (r.version !== 1 || typeof r.startedAt !== "string") return null;
  return {
    ...r,
    version: 1,
    startedAt: r.startedAt,
    attempts: typeof r.attempts === "number" ? r.attempts : 0,
    lastAttemptAt: typeof r.lastAttemptAt === "string" ? r.lastAttemptAt : r.startedAt,
    steps: r.steps && typeof r.steps === "object" ? r.steps : {},
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
  };
}

export function addWarning(report: DeletionReport, warning: string): void {
  if (report.warnings.length < MAX_WARNINGS) report.warnings.push(warning.slice(0, 500));
}

export function isDeletionFinished(report: DeletionReport): boolean {
  return DELETION_STEPS.every((step) => report.steps[step]?.status === "done");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Human summary for the `deletion_completed` email, e.g. "2 identity models, 24 training photos, …". */
export function describeDeletion(summary: DeletionSummary | undefined): string {
  if (!summary) return "Your profile, identity models, photos, videos and uploads.";
  const parts = [
    plural(summary.identityModels, "identity model", "identity models"),
    plural(summary.trainingPhotos, "training photo", "training photos"),
    plural(summary.media, "photo or video", "photos and videos"),
    plural(summary.uploads, "upload", "uploads"),
    plural(summary.shareLinks, "share link", "share links"),
  ];
  if (summary.subscriptions > 0) parts.push(plural(summary.subscriptions, "subscription canceled", "subscriptions canceled"));
  return `${parts.join(", ")}, plus your profile, sign-in methods, API keys and history.`;
}
