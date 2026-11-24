/**
 * "Download my data": everything the user owns as one JSON document. Files are included as signed
 * URLs valid for 24 hours. Never exported: face embeddings, secrets (token/key hashes, OAuth tokens),
 * provider internals (request ids, weights URLs, costs) and storage keys.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { APP } from "@/config/app";
import { db } from "@/db";
import {
  account,
  apiKeys,
  batches,
  brandKits,
  consentRecords,
  creditLedger,
  emailOutbox,
  folders,
  identityModels,
  jobs,
  media,
  modelShares,
  payments,
  shareLinks,
  subscriptions,
  teamMembers,
  teams,
  trainingPhotos,
  uploads,
  user as userTable,
} from "@/db/schema";
import { errors } from "@/server/http";
import { signedUrl } from "@/server/storage";

export const EXPORT_FORMAT = "openshoot.account-export.v1";
export const EXPORT_URL_TTL_SEC = 24 * 3600;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function fileUrl(key: string | null | undefined, downloadName?: string): Promise<string | null> {
  return key ? signedUrl(key, { expiresInSec: EXPORT_URL_TTL_SEC, downloadName }) : Promise.resolve(null);
}

function extensionOf(key: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(key);
  return match ? match[1]!.toLowerCase() : "bin";
}

export function exportFileName(now: Date = new Date()): string {
  const slug = APP.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "account";
  return `${slug}-export-${now.toISOString().slice(0, 10)}.json`;
}

async function exportProfile(userId: string) {
  const [u] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  if (!u || u.deletedAt) throw errors.notFound("Account");
  const signIns = await db
    .select({ providerId: account.providerId, createdAt: account.createdAt })
    .from(account)
    .where(eq(account.userId, userId))
    .orderBy(asc(account.createdAt));
  return {
    profile: {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      name: u.name,
      image: u.image,
      role: u.role,
      plan: u.plan,
      credits: u.credits,
      hasPaid: u.hasPaid,
      locale: u.locale,
      marketingOptIn: u.marketingOptIn,
      createdAt: iso(u.createdAt),
    },
    signInMethods: [
      // Email sign-in links work for every account; OAuth providers have an `account` row.
      { providerId: "email", createdAt: iso(u.createdAt) },
      ...signIns.map((s) => ({ providerId: s.providerId, createdAt: iso(s.createdAt) })),
    ],
  };
}

async function exportModels(userId: string) {
  const [models, photos, consents] = await Promise.all([
    db
      .select()
      .from(identityModels)
      .where(and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
      .orderBy(asc(identityModels.createdAt)),
    db.select().from(trainingPhotos).where(eq(trainingPhotos.userId, userId)).orderBy(asc(trainingPhotos.createdAt)),
    db.select().from(consentRecords).where(eq(consentRecords.userId, userId)).orderBy(asc(consentRecords.createdAt)),
  ]);
  const liveModelIds = new Set(models.map((m) => m.id));
  return {
    identityModels: await Promise.all(
      models.map(async (m) => ({
        id: m.id,
        name: m.name,
        subject: m.subject,
        status: m.status,
        mode: m.metadata?.mode === "instant" ? "instant" : "trained",
        triggerWord: m.triggerWord,
        provider: m.provider,
        consentVerifiedAt: iso(m.consentVerifiedAt),
        consentSelfieUrl: await fileUrl(m.consentSelfieKey, `consent-selfie-${m.id}.jpg`),
        trainedAt: iso(m.trainedAt),
        createdAt: iso(m.createdAt),
      })),
    ),
    trainingPhotos: await Promise.all(
      photos
        .filter((p) => liveModelIds.has(p.modelId))
        .map(async (p) => ({
          id: p.id,
          modelId: p.modelId,
          status: p.status,
          width: p.width,
          height: p.height,
          bytes: p.bytes,
          issues: p.quality?.issues?.map((issue) => issue.code) ?? [],
          createdAt: iso(p.createdAt),
          url: await fileUrl(p.storageKey, `training-${p.id}.jpg`),
        })),
    ),
    consentRecords: consents.map((c) => ({
      id: c.id,
      kind: c.kind,
      modelId: c.modelId,
      ipAddress: c.ipAddress,
      userAgent: c.userAgent,
      createdAt: iso(c.createdAt),
    })),
  };
}

async function exportFiles(userId: string) {
  const [mediaRows, uploadRows, folderRows] = await Promise.all([
    db
      .select()
      .from(media)
      .where(and(eq(media.userId, userId), isNull(media.deletedAt)))
      .orderBy(asc(media.createdAt)),
    db.select().from(uploads).where(eq(uploads.userId, userId)).orderBy(asc(uploads.createdAt)),
    db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.createdAt)),
  ]);
  return {
    folders: folderRows.map((f) => ({ id: f.id, name: f.name, createdAt: iso(f.createdAt) })),
    media: await Promise.all(
      mediaRows.map(async (m) => ({
        id: m.id,
        kind: m.kind,
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        bytes: m.bytes,
        prompt: m.prompt,
        seed: m.seed,
        modelId: m.modelId,
        jobId: m.jobId,
        packId: m.packId,
        batchId: m.batchId,
        folderId: m.folderId,
        parentMediaId: m.parentMediaId,
        isDraft: m.isDraft,
        isFavorite: m.isFavorite,
        hidden: m.hidden,
        watermarked: m.watermarked,
        scores: m.scores,
        // Removed by moderation after a report: the record stays, the file is gone.
        removed: m.removedAt !== null,
        createdAt: iso(m.createdAt),
        url: m.removedAt ? null : await fileUrl(m.storageKey, `${m.id}.${extensionOf(m.storageKey)}`),
      })),
    ),
    uploads: await Promise.all(
      uploadRows.map(async (u) => ({
        id: u.id,
        purpose: u.purpose,
        mimeType: u.mimeType,
        width: u.width,
        height: u.height,
        bytes: u.bytes,
        createdAt: iso(u.createdAt),
        url: await fileUrl(u.storageKey, `upload-${u.id}.${extensionOf(u.storageKey)}`),
      })),
    ),
  };
}

async function exportActivity(userId: string) {
  const [jobRows, batchRows, links, keys, sent, received, emails] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(asc(jobs.createdAt)),
    db.select().from(batches).where(eq(batches.userId, userId)).orderBy(asc(batches.createdAt)),
    db.select().from(shareLinks).where(eq(shareLinks.userId, userId)).orderBy(asc(shareLinks.createdAt)),
    db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(asc(apiKeys.createdAt)),
    db.select().from(modelShares).where(eq(modelShares.requesterUserId, userId)).orderBy(asc(modelShares.createdAt)),
    db.select().from(modelShares).where(eq(modelShares.ownerUserId, userId)).orderBy(asc(modelShares.createdAt)),
    db
      .select({
        template: emailOutbox.template,
        subject: emailOutbox.subject,
        status: emailOutbox.status,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.userId, userId))
      .orderBy(asc(emailOutbox.createdAt)),
  ]);
  const now = Date.now();
  return {
    jobs: jobRows.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      input: j.input,
      error: j.error,
      progress: j.progress,
      creditsCharged: j.creditsCharged,
      creditsRefunded: j.creditsRefunded,
      modelId: j.modelId,
      packId: j.packId,
      batchId: j.batchId,
      sourceMediaId: j.sourceMediaId,
      createdAt: iso(j.createdAt),
      completedAt: iso(j.completedAt),
    })),
    batches: batchRows.map((b) => ({
      id: b.id,
      modelId: b.modelId,
      packId: b.packId,
      total: b.total,
      completed: b.completed,
      failed: b.failed,
      status: b.status,
      createdAt: iso(b.createdAt),
    })),
    shareLinks: links.map((l) => {
      const active = !l.revokedAt && (!l.expiresAt || l.expiresAt.getTime() > now);
      return {
        id: l.id,
        mediaId: l.mediaId,
        folderId: l.folderId,
        views: l.views,
        url: active ? `${APP.url}/s/${l.token}` : null,
        expiresAt: iso(l.expiresAt),
        revokedAt: iso(l.revokedAt),
        createdAt: iso(l.createdAt),
      };
    }),
    apiKeys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      lastUsedAt: iso(k.lastUsedAt),
      revokedAt: iso(k.revokedAt),
      createdAt: iso(k.createdAt),
    })),
    multiPerson: {
      invitesSent: sent.map((s) => ({
        id: s.id,
        inviteeEmail: s.inviteeEmail,
        status: s.status,
        message: s.message,
        modelId: s.modelId,
        createdAt: iso(s.createdAt),
        respondedAt: iso(s.respondedAt),
      })),
      modelsSharedByMe: received.map((s) => ({
        id: s.id,
        modelId: s.modelId,
        status: s.status,
        createdAt: iso(s.createdAt),
        respondedAt: iso(s.respondedAt),
      })),
    },
    emails: emails.map((e) => ({ ...e, createdAt: iso(e.createdAt) })),
  };
}

async function exportBilling(userId: string) {
  const [ledger, paymentRows, subscriptionRows] = await Promise.all([
    db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(asc(creditLedger.createdAt)),
    db.select().from(payments).where(eq(payments.userId, userId)).orderBy(asc(payments.createdAt)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(asc(subscriptions.createdAt)),
  ]);
  return {
    creditLedger: ledger.map((l) => ({
      id: l.id,
      delta: l.delta,
      balanceAfter: l.balanceAfter,
      reason: l.reason,
      jobId: l.jobId,
      paymentId: l.paymentId,
      note: l.note,
      createdAt: iso(l.createdAt),
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      provider: p.provider,
      kind: p.kind,
      productId: p.productId,
      amountCents: p.amountCents,
      currency: p.currency,
      credits: p.credits,
      status: p.status,
      createdAt: iso(p.createdAt),
    })),
    subscriptions: subscriptionRows.map((s) => ({
      id: s.id,
      provider: s.provider,
      planId: s.planId,
      interval: s.interval,
      status: s.status,
      currentPeriodEnd: iso(s.currentPeriodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      createdAt: iso(s.createdAt),
    })),
  };
}

async function exportTeams(userId: string) {
  const memberships = await db
    .select({ member: teamMembers, team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId));
  const owned = await db.select().from(teams).where(eq(teams.ownerId, userId)).orderBy(asc(teams.createdAt));
  const kits = await Promise.all(
    owned.map((t) => db.select().from(brandKits).where(eq(brandKits.teamId, t.id)).orderBy(asc(brandKits.createdAt))),
  );
  return {
    teamsOwned: owned.map((t, i) => ({
      id: t.id,
      name: t.name,
      createdAt: iso(t.createdAt),
      brandKits: kits[i]!.map((k) => ({
        id: k.id,
        name: k.name,
        backgroundPrompt: k.backgroundPrompt,
        outfitPrompt: k.outfitPrompt,
        stylePrompt: k.stylePrompt,
        lighting: k.lighting,
        aspectRatio: k.aspectRatio,
        basePackId: k.basePackId,
        colorHex: k.colorHex,
        createdAt: iso(k.createdAt),
      })),
    })),
    teamMemberships: memberships.map(({ member, team }) => ({
      teamId: team.id,
      teamName: team.name,
      role: member.role,
      status: member.status,
      createdAt: iso(member.createdAt),
    })),
  };
}

/** Every record the user owns, as plain JSON (see the module comment for what is left out). */
export async function exportAccountData(userId: string) {
  const exportedAt = new Date();
  const { profile, signInMethods } = await exportProfile(userId);
  const [models, files, activity, billing, teamData] = await Promise.all([
    exportModels(userId),
    exportFiles(userId),
    exportActivity(userId),
    exportBilling(userId),
    exportTeams(userId),
  ]);
  return {
    format: EXPORT_FORMAT,
    app: APP.name,
    exportedAt: exportedAt.toISOString(),
    urlsExpireAt: new Date(exportedAt.getTime() + EXPORT_URL_TTL_SEC * 1000).toISOString(),
    profile,
    signInMethods,
    ...models,
    ...files,
    ...activity,
    ...billing,
    ...teamData,
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;
