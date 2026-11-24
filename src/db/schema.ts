/**
 * OpenShoot database schema (Drizzle ORM, Postgres).
 *
 * CONTRACT FILE — see docs/CONTRACTS.md. Column names are snake_case in the
 * database (drizzle `casing: "snake_case"`), camelCase in TypeScript.
 *
 * Better Auth tables (user/session/account/verification) follow Better Auth's
 * expected shape, extended with app fields (credits, plan, role, ban...).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { newId } from "@/lib/ids";
import type {
  ApiKeyScope,
  BatchStatus,
  ConsentKind,
  CreditReason,
  DeletionStatus,
  EmailStatus,
  FaceAnalysisSummary,
  InviteStatus,
  JobInput,
  JobOutput,
  JobStatus,
  JobType,
  MediaKind,
  MediaScores,
  ModelStatus,
  ModerationEventKind,
  ModerationSnapshot,
  PaymentKind,
  PaymentProviderName,
  PhotoQualityReport,
  PhotoStatus,
  PlanId,
  AIProviderName,
  ReportStatus,
  Subject,
  SubscriptionStatus,
  TeamRole,
  UserRole,
} from "@/types/domain";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────────── Better Auth core ───────────────────────────── */

export const user = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull().default(""),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Better Auth admin plugin fields
    role: text().$type<UserRole>().notNull().default("user"),
    banned: boolean().default(false),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true }),
    // App fields
    credits: integer().notNull().default(0),
    plan: text().$type<PlanId>().notNull().default("free"),
    /** True once the user ever paid (subscription or credit pack). Drives watermarking. */
    hasPaid: boolean().notNull().default(false),
    stripeCustomerId: text(),
    locale: text().notNull().default("en"),
    marketingOptIn: boolean().notNull().default(false),
    lowCreditsNotifiedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("user_email_idx").on(t.email),
    // Admin user list (newest first, keyset on created_at + id).
    index("user_created_idx").on(t.createdAt, t.id),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text(),
  },
  (t) => [uniqueIndex("session_token_idx").on(t.token), index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────────────────────────── Identity models ───────────────────────────── */

/** A trained personal identity model ("you", or a person who consented). */
export const identityModels = pgTable(
  "identity_models",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("mdl")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    subject: text().$type<Subject>().notNull().default("person"),
    /** Unique token used in prompts to refer to this identity, e.g. "ohwx_k3j9". */
    triggerWord: text().notNull(),
    status: text().$type<ModelStatus>().notNull().default("awaiting_consent"),
    /** Storage key of the live consent selfie (private). */
    consentSelfieKey: text(),
    /** Face embedding of the consent selfie — every training photo must match it. */
    consentEmbedding: jsonb().$type<number[]>(),
    consentVerifiedAt: timestamp({ withTimezone: true }),
    /** Provider that trained the model + provider-side reference (LoRA URL, Replicate version...). */
    provider: text().$type<AIProviderName>(),
    providerModelRef: text(),
    trainingJobId: text(),
    coverMediaKey: text(),
    /** Aggregate photo-quality report for the whole training set. */
    qualitySummary: jsonb().$type<Record<string, unknown>>(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    trainedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("identity_models_user_idx").on(t.userId),
    uniqueIndex("identity_models_trigger_idx").on(t.triggerWord),
  ],
);

/** A selfie uploaded for training, with its quality + safety analysis. */
export const trainingPhotos = pgTable(
  "training_photos",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("tph")),
    modelId: text()
      .notNull()
      .references(() => identityModels.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storageKey: text().notNull(),
    thumbKey: text(),
    width: integer().notNull(),
    height: integer().notNull(),
    bytes: integer().notNull().default(0),
    /** Perceptual hash (hex) used to detect duplicates. */
    phash: text(),
    status: text().$type<PhotoStatus>().notNull().default("pending"),
    quality: jsonb().$type<PhotoQualityReport>(),
    face: jsonb().$type<FaceAnalysisSummary>(),
    faceMatchScore: real(),
    ageEstimate: real(),
    createdAt: createdAt(),
  },
  (t) => [
    index("training_photos_model_idx").on(t.modelId),
    // FK (ON DELETE CASCADE from user): without it every user deletion scans the table.
    index("training_photos_user_idx").on(t.userId),
  ],
);

/** Audit trail for consent: live selfie captures and multi-person consents. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("cns")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: text().references(() => identityModels.id, { onDelete: "cascade" }),
    kind: text().$type<ConsentKind>().notNull(),
    ipAddress: text(),
    userAgent: text(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("consent_records_user_idx").on(t.userId), index("consent_records_model_idx").on(t.modelId)],
);

/**
 * Multi-person consent: the owner of `modelId` lets `requesterUserId` combine it
 * with the requester's own models. Created as an invite (by email), accepted in-app.
 */
export const modelShares = pgTable(
  "model_shares",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("shr")),
    requesterUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteeEmail: text().notNull(),
    ownerUserId: text().references(() => user.id, { onDelete: "cascade" }),
    modelId: text().references(() => identityModels.id, { onDelete: "cascade" }),
    status: text().$type<InviteStatus>().notNull().default("pending"),
    tokenHash: text().notNull(),
    message: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    respondedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("model_shares_requester_idx").on(t.requesterUserId),
    index("model_shares_owner_idx").on(t.ownerUserId),
    uniqueIndex("model_shares_token_idx").on(t.tokenHash),
    index("model_shares_model_idx").on(t.modelId),
  ],
);

/* ───────────────────────────── Jobs ───────────────────────────── */

/** Groups many jobs created by one "batch" click (e.g. one pack -> 50 images). */
export const batches = pgTable(
  "batches",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("bat")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: text().references(() => identityModels.id, { onDelete: "set null" }),
    packId: text(),
    brandKitId: text(),
    total: integer().notNull(),
    completed: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    status: text().$type<BatchStatus>().notNull().default("running"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("batches_user_idx").on(t.userId),
    index("batches_model_idx").on(t.modelId).where(sql`${t.modelId} is not null`),
    // repairStaleBatches (every cron tick / worker pass) only looks at running batches.
    index("batches_running_idx").on(t.updatedAt).where(sql`${t.status} = 'running'`),
  ],
);

/**
 * Every AI operation is a job. Postgres-backed queue: provider webhooks update
 * jobs; a polling fallback (cron / worker / lazy-on-read) covers missed webhooks.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("job")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text().$type<JobType>().notNull(),
    status: text().$type<JobStatus>().notNull().default("queued"),
    /** Validated request input (shape depends on `type`). */
    input: jsonb().$type<JobInput>().notNull(),
    output: jsonb().$type<JobOutput>(),
    error: text(),
    /** Short machine-readable error code, e.g. "content_blocked", "provider_error". */
    errorCode: text(),
    progress: integer().notNull().default(0),
    provider: text().$type<AIProviderName>(),
    providerEndpoint: text(),
    providerRequestId: text(),
    creditsCharged: integer().notNull().default(0),
    creditsRefunded: integer().notNull().default(0),
    /** Estimated provider cost in USD (for admin cost reporting). */
    costUsd: real().notNull().default(0),
    modelId: text().references(() => identityModels.id, { onDelete: "set null" }),
    packId: text(),
    batchId: text().references(() => batches.id, { onDelete: "set null" }),
    /** Source media for edits/upscales/videos. */
    sourceMediaId: text(),
    apiKeyId: text(),
    idempotencyKey: text(),
    attempts: integer().notNull().default(0),
    lastPolledAt: timestamp({ withTimezone: true }),
    submittedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_user_idx").on(t.userId, t.createdAt),
    index("jobs_status_idx").on(t.status),
    index("jobs_batch_idx").on(t.batchId),
    uniqueIndex("jobs_provider_request_idx").on(t.provider, t.providerRequestId),
    uniqueIndex("jobs_idempotency_idx").on(t.userId, t.idempotencyKey),
    // FK (ON DELETE SET NULL from identity_models): model deletion would scan all jobs.
    index("jobs_model_idx").on(t.modelId).where(sql`${t.modelId} is not null`),
    // Plan concurrency check (assertConcurrency): a user's active jobs, without walking their history.
    index("jobs_active_user_idx").on(t.userId).where(sql`${t.status} in ('queued', 'running')`),
    // Admin job list / stats: newest first across all users.
    index("jobs_created_idx").on(t.createdAt, t.id),
    // Keyset pagination of a user's jobs: matches `createdMs` in src/server/jobs/queries.ts.
    index("jobs_user_created_ms_idx").on(t.userId, sql`date_trunc('milliseconds', ${t.createdAt}, 'UTC')`, t.id),
  ],
);

/* ───────────────────────────── Media / gallery ───────────────────────────── */

export const folders = pgTable(
  "folders",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("fld")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("folders_user_idx").on(t.userId)],
);

/** A generated (or derived) photo or video owned by a user. */
export const media = pgTable(
  "media",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("med")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text().references(() => jobs.id, { onDelete: "set null" }),
    modelId: text().references(() => identityModels.id, { onDelete: "set null" }),
    kind: text().$type<MediaKind>().notNull(),
    storageKey: text().notNull(),
    thumbKey: text(),
    mimeType: text().notNull(),
    bytes: integer().notNull().default(0),
    width: integer(),
    height: integer(),
    durationSec: real(),
    prompt: text(),
    packId: text(),
    batchId: text(),
    /** Low-cost instant preview; can be upgraded to full quality. */
    isDraft: boolean().notNull().default(false),
    isFavorite: boolean().notNull().default(false),
    /** Hidden by the "best shots" picker (still accessible via "show all"). */
    hidden: boolean().notNull().default(false),
    folderId: text().references(() => folders.id, { onDelete: "set null" }),
    parentMediaId: text(),
    seed: integer(),
    scores: jsonb().$type<MediaScores>(),
    moderation: jsonb().$type<ModerationSnapshot>(),
    watermarked: boolean().notNull().default(false),
    /** Set when an admin removes media after a report. */
    removedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("media_user_idx").on(t.userId, t.createdAt),
    index("media_job_idx").on(t.jobId),
    index("media_folder_idx").on(t.folderId),
    // FK (ON DELETE SET NULL from identity_models): model deletion would scan all media.
    index("media_model_idx").on(t.modelId).where(sql`${t.modelId} is not null`),
    // Viewer "versions" (children of a photo).
    index("media_parent_idx").on(t.parentMediaId).where(sql`${t.parentMediaId} is not null`),
    // Gallery keyset pagination + viewer prev/next: matches `createdMs` in src/server/gallery/media.ts.
    index("media_user_created_ms_idx").on(t.userId, sql`date_trunc('milliseconds', ${t.createdAt}, 'UTC')`, t.id),
  ],
);

/** Uploaded inputs that are not training photos (references, garments, masks, edit sources). */
export const uploads = pgTable(
  "uploads",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("upl")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text().$type<"reference" | "garment" | "mask" | "edit_source" | "consent" | "audio">().notNull(),
    storageKey: text().notNull(),
    mimeType: text().notNull(),
    bytes: integer().notNull().default(0),
    width: integer(),
    height: integer(),
    face: jsonb().$type<FaceAnalysisSummary>(),
    moderation: jsonb().$type<ModerationSnapshot>(),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_user_idx").on(t.userId)],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("sl")),
    /** Public random token used in /s/[token]. */
    token: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: text().references(() => media.id, { onDelete: "cascade" }),
    folderId: text().references(() => folders.id, { onDelete: "cascade" }),
    views: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("share_links_token_idx").on(t.token),
    index("share_links_user_idx").on(t.userId),
    // FKs (ON DELETE CASCADE): deleting media / folders checks share_links once per deleted row.
    index("share_links_media_idx").on(t.mediaId).where(sql`${t.mediaId} is not null`),
    index("share_links_folder_idx").on(t.folderId).where(sql`${t.folderId} is not null`),
  ],
);

/* ───────────────────────────── Safety / moderation ───────────────────────────── */

/** Abuse reports from the public report button on shared images. */
export const reports = pgTable(
  "reports",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("rpt")),
    shareLinkId: text().references(() => shareLinks.id, { onDelete: "set null" }),
    mediaId: text().references(() => media.id, { onDelete: "set null" }),
    /** Owner of the reported content (denormalized for the admin queue). */
    targetUserId: text().references(() => user.id, { onDelete: "set null" }),
    reporterUserId: text().references(() => user.id, { onDelete: "set null" }),
    reporterEmail: text(),
    reason: text()
      .$type<"non_consensual" | "sexual" | "minor" | "impersonation" | "harassment" | "copyright" | "other">()
      .notNull(),
    details: text(),
    status: text().$type<ReportStatus>().notNull().default("open"),
    resolution: text(),
    resolvedBy: text(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_status_idx").on(t.status),
    // FKs (ON DELETE SET NULL): media / share link / user deletions check reports once per deleted row.
    index("reports_media_idx").on(t.mediaId).where(sql`${t.mediaId} is not null`),
    index("reports_share_link_idx").on(t.shareLinkId).where(sql`${t.shareLinkId} is not null`),
    index("reports_target_user_idx").on(t.targetUserId).where(sql`${t.targetUserId} is not null`),
    index("reports_reporter_user_idx").on(t.reporterUserId).where(sql`${t.reporterUserId} is not null`),
  ],
);

/** Every safety decision that blocked something (for the admin moderation queue + audits). */
export const moderationEvents = pgTable(
  "moderation_events",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("mev")),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    jobId: text(),
    modelId: text(),
    kind: text().$type<ModerationEventKind>().notNull(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    reviewed: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("moderation_events_user_idx").on(t.userId),
    index("moderation_events_kind_idx").on(t.kind),
    // Admin review queue + dashboard count: unreviewed events, newest first.
    index("moderation_events_unreviewed_idx").on(t.createdAt, t.id).where(sql`${t.reviewed} = false`),
  ],
);

/* ───────────────────────────── Credits & billing ───────────────────────────── */

/**
 * Append-only credit ledger. `user.credits` is the cached balance, always updated
 * in the same transaction as the ledger insert. `idempotencyKey` makes debits,
 * refunds and grants safe to retry (e.g. "refund:job_123", "stripe:evt_abc").
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("crd")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: integer().notNull(),
    balanceAfter: integer().notNull(),
    reason: text().$type<CreditReason>().notNull(),
    jobId: text(),
    paymentId: text(),
    note: text(),
    createdBy: text(),
    idempotencyKey: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("credit_ledger_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("credit_ledger_idempotency_idx").on(t.idempotencyKey),
    // Admin stats (activity over a period, all users).
    index("credit_ledger_created_idx").on(t.createdAt),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("sub")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().$type<PaymentProviderName>().notNull(),
    providerSubscriptionId: text().notNull(),
    providerCustomerId: text(),
    planId: text().$type<PlanId>().notNull(),
    interval: text().$type<"month" | "year">().notNull().default("month"),
    status: text().$type<SubscriptionStatus>().notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    /** Timestamp of the newest provider event applied — older events are ignored (out-of-order safety). */
    lastEventAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_idx").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_user_idx").on(t.userId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("pay")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().$type<PaymentProviderName>().notNull(),
    /** Checkout session id / invoice id — unique per provider. */
    providerPaymentId: text().notNull(),
    kind: text().$type<PaymentKind>().notNull(),
    productId: text().notNull(),
    amountCents: integer().notNull(),
    currency: text().notNull().default("usd"),
    credits: integer().notNull().default(0),
    status: text().$type<"paid" | "refunded" | "failed">().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_idx").on(t.provider, t.providerPaymentId),
    index("payments_user_idx").on(t.userId),
    // Admin revenue list / stats (newest first, period filters).
    index("payments_created_idx").on(t.createdAt, t.id),
  ],
);

/** Idempotency log for ALL inbound webhooks (payments + AI providers). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    source: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
    payload: jsonb().$type<unknown>(),
  },
  (t) => [primaryKey({ columns: [t.source, t.eventId] })],
);

/* ───────────────────────────── API keys, rate limits ───────────────────────────── */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("key")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** First characters of the key, shown in the UI (e.g. "os_live_ab12"). */
    prefix: text().notNull(),
    /** SHA-256 hex of the full key. The key itself is never stored. */
    keyHash: text().notNull(),
    scopes: jsonb().$type<ApiKeyScope[]>().notNull().default(["*"]),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash), index("api_keys_user_idx").on(t.userId)],
);

/** Fixed-window rate limit counters (no Redis needed). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    // Daily prune of old windows (the primary key leads with `key`).
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

/* ───────────────────────────── Teams & brand kits ───────────────────────────── */

export const teams = pgTable("teams", {
  id: text()
    .primaryKey()
    .$defaultFn(() => newId("team")),
  ownerId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("tm")),
    teamId: text()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text().$type<TeamRole>().notNull().default("member"),
    status: text().$type<"invited" | "active">().notNull().default("invited"),
    inviteTokenHash: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("team_members_team_idx").on(t.teamId),
    index("team_members_user_idx").on(t.userId),
    uniqueIndex("team_members_team_email_idx").on(t.teamId, t.email),
  ],
);

/** Consistent look across a whole team's headshots. */
export const brandKits = pgTable(
  "brand_kits",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("bk")),
    teamId: text()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text().notNull(),
    backgroundPrompt: text().notNull().default(""),
    outfitPrompt: text().notNull().default(""),
    stylePrompt: text().notNull().default(""),
    lighting: text().notNull().default(""),
    aspectRatio: text().notNull().default("4:5"),
    basePackId: text(),
    colorHex: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("brand_kits_team_idx").on(t.teamId)],
);

/* ───────────────────────────── Email & account lifecycle ───────────────────────────── */

/** Every email sent (or mocked). In mock mode /dev/emails reads from here. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("eml")),
    userId: text(),
    to: text().notNull(),
    subject: text().notNull(),
    template: text().notNull(),
    html: text().notNull(),
    text: text(),
    status: text().$type<EmailStatus>().notNull(),
    providerMessageId: text(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_outbox_to_idx").on(t.to, t.createdAt),
    // Daily prune by age.
    index("email_outbox_created_idx").on(t.createdAt),
  ],
);

/** Account deletion is confirmed by email before it is executed. */
export const deletionRequests = pgTable(
  "deletion_requests",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => newId("del")),
    userId: text().notNull(),
    email: text().notNull(),
    tokenHash: text().notNull(),
    status: text().$type<DeletionStatus>().notNull().default("pending"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    confirmedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    report: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("deletion_requests_token_idx").on(t.tokenHash)],
);
