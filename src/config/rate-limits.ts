/** Rate limits (fixed window, Postgres-backed). CONTRACT FILE. */
export const RATE_LIMITS = {
  /** POST /api/jobs (all generation endpoints) per user. */
  jobsPerMinute: { limit: 20, windowSec: 60 },
  jobsPerDay: { limit: 2000, windowSec: 86_400 },
  /** Free draft previews per user per day. */
  draftsPerDay: { limit: 30, windowSec: 86_400 },
  /** Users who never paid. */
  draftsPerDayFree: { limit: 5, windowSec: 86_400 },
  batchesPerHour: { limit: 10, windowSec: 3600 },
  uploadsPerMinute: { limit: 60, windowSec: 60 },
  promptHelperPerMinute: { limit: 20, windowSec: 60 },
  trainingsPerDay: { limit: 5, windowSec: 86_400 },
  /** Team + multi-person invite emails per user. */
  invitesPerHour: { limit: 30, windowSec: 3600 },
  /** Account deletion confirmations per IP. */
  accountDeleteConfirmPerHourPerIp: { limit: 10, windowSec: 3600 },
  /** Public endpoints, keyed by IP. */
  reportsPerHourPerIp: { limit: 20, windowSec: 3600 },
  magicLinkPerHourPerIp: { limit: 10, windowSec: 3600 },
  /** Public API, per key. */
  apiPerMinute: { limit: 120, windowSec: 60 },
} as const;
export type RateLimitName = keyof typeof RATE_LIMITS;
