/** Multi-person ("Together") limits and lifetimes. */

/** A pending invite link works for this long. */
export const INVITE_TTL_DAYS = 14;
/**
 * Once accepted, consent lasts this long (then the requester must invite again). Stored in
 * model_shares.expires_at, which `assertModelsUsable` checks on every job.
 */
export const SHARE_TTL_DAYS = 365;
/** Pending (unanswered, unexpired) invites a user may have at once. */
export const MAX_PENDING_INVITES = 20;
/** Invite emails a user may send (new invites + re-sends), per fixed window. */
export const INVITE_RATE_LIMITS = [
  { name: "multiPersonInvitesPerHour", limit: 10, windowSec: 3600 },
  { name: "multiPersonInvitesPerDay", limit: 30, windowSec: 86_400 },
] as const;
export const MAX_INVITE_MESSAGE_LENGTH = 500;
/** Reference photos sent to the provider per person in a together photo. */
export const REFERENCE_PHOTOS_PER_PERSON = 4;
/** Version tag stored with every multi-person consent record. */
export const CONSENT_VERSION = "multi-person-v1";
/** What the invitee agrees to (stored verbatim in consent_records.evidence). */
export const CONSENT_STATEMENT =
  "I allow the person who invited me to combine the identity model I selected with their own models to create " +
  "photos of us together. I can stop sharing at any time; photos already created stay in their gallery.";

export const DAY_MS = 86_400_000;
