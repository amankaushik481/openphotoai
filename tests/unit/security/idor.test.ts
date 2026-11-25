/**
 * Broken access control, table-driven: the victim owns one of everything (model + training photo, job,
 * batch, media, folder, share link, upload, API key, team + member + brand kit + pending invite,
 * multi-person invite + share). The attacker, a separate signed-in Studio user with an API key of
 * their own, calls every id-taking route with the victim's ids and must get 404/403 (never 200), and
 * nothing of the victim's may change. Non-admins get 403 from every admin route.
 * (security-2.md "IDOR"; runs the real route handlers on PGlite with the session mocked.)
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as adminRefund } from "@/app/api/admin/jobs/[id]/refund/route";
import { GET as adminJobs } from "@/app/api/admin/jobs/route";
import { POST as adminReview } from "@/app/api/admin/moderation-events/[id]/review/route";
import { GET as adminModeration } from "@/app/api/admin/moderation/route";
import { POST as adminResolve } from "@/app/api/admin/reports/[id]/resolve/route";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { POST as adminCredits } from "@/app/api/admin/users/[id]/credits/route";
import { GET as adminUser } from "@/app/api/admin/users/[id]/route";
import { POST as adminSuspend } from "@/app/api/admin/users/[id]/suspend/route";
import { POST as adminUnsuspend } from "@/app/api/admin/users/[id]/unsuspend/route";
import { GET as adminUsers } from "@/app/api/admin/users/route";
import { DELETE as apiKeyDelete } from "@/app/api/api-keys/[id]/route";
import { GET as batchGet } from "@/app/api/batches/[id]/route";
import { POST as batchesPost } from "@/app/api/batches/route";
import { DELETE as kitDelete, PATCH as kitPatch } from "@/app/api/brand-kits/[id]/route";
import { DELETE as folderDelete, PATCH as folderPatch } from "@/app/api/folders/[id]/route";
import { POST as jobCancel } from "@/app/api/jobs/[id]/cancel/route";
import { GET as jobGet } from "@/app/api/jobs/[id]/route";
import { GET as jobsGet, POST as jobsPost } from "@/app/api/jobs/route";
import { DELETE as mediaDelete, GET as mediaGet, PATCH as mediaPatch } from "@/app/api/media/[id]/route";
import { POST as mediaBulk } from "@/app/api/media/bulk/route";
import { POST as mediaDownload } from "@/app/api/media/download/route";
import { GET as mediaList } from "@/app/api/media/route";
import { POST as consentChallenge } from "@/app/api/models/[id]/consent/challenge/route";
import { POST as consentPost } from "@/app/api/models/[id]/consent/route";
import { DELETE as photoDelete } from "@/app/api/models/[id]/photos/[photoId]/route";
import { POST as photosPost } from "@/app/api/models/[id]/photos/route";
import { DELETE as modelDelete, GET as modelGet, PATCH as modelPatch } from "@/app/api/models/[id]/route";
import { POST as modelTrain } from "@/app/api/models/[id]/train/route";
import { POST as mpAccept } from "@/app/api/multi-person/invites/[token]/accept/route";
import { POST as mpDecline } from "@/app/api/multi-person/invites/[token]/decline/route";
import { DELETE as mpShareDelete } from "@/app/api/multi-person/shares/[id]/route";
import { DELETE as shareDelete } from "@/app/api/share/[id]/route";
import { GET as sharesGet, POST as sharePost } from "@/app/api/share/route";
import { GET as teamKitsGet, POST as teamKitsPost } from "@/app/api/teams/[id]/brand-kits/route";
import { POST as teamTransfer } from "@/app/api/teams/[id]/credits/transfer/route";
import { POST as teamInvite } from "@/app/api/teams/[id]/invites/route";
import { DELETE as memberDelete, PATCH as memberPatch } from "@/app/api/teams/[id]/members/[memberId]/route";
import { DELETE as teamDelete, GET as teamGet, PATCH as teamPatch } from "@/app/api/teams/[id]/route";
import { POST as teamAccept } from "@/app/api/teams/invites/[token]/accept/route";
import { DELETE as uploadDelete } from "@/app/api/uploads/[id]/route";
import { GET as v1BatchGet } from "@/app/api/v1/batches/[id]/route";
import { POST as v1Batches } from "@/app/api/v1/batches/route";
import { POST as v1JobCancel } from "@/app/api/v1/jobs/[id]/cancel/route";
import { GET as v1JobGet } from "@/app/api/v1/jobs/[id]/route";
import { GET as v1Jobs, POST as v1JobsPost } from "@/app/api/v1/jobs/route";
import { GET as v1MediaGet } from "@/app/api/v1/media/[id]/route";
import { GET as v1Media } from "@/app/api/v1/media/route";
import { GET as v1ModelGet } from "@/app/api/v1/models/[id]/route";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { ApiKeyRow, UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { createLocalStorage } from "@/providers/storage/local";
import { createApiKey } from "@/server/auth/api-keys";
import { createBrandKit, createTeam, inviteMember } from "@/server/teams";
import { getStorage, setStorageForTesting, storageKeys } from "@/server/storage";
import { hashInviteToken } from "@/server/together/tokens";
import {
  callRoute,
  createTestDb,
  createTestJob,
  createTestMedia,
  createTestModel,
  createTestUpload,
  createTestUser,
  sessionMock,
} from "../../helpers/factories";

vi.mock("@/server/auth/session", () => sessionMock);
vi.mock("@/server/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "eml", status: "mocked" })),
  sendEmailSafe: vi.fn(async () => ({ id: "eml", status: "mocked" })),
}));

let storageDir: string;
beforeAll(async () => {
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-idor-"));
  setStorageForTesting(createLocalStorage({ dir: storageDir, baseUrl: "http://localhost:3000", secret: "idor-test-secret" }));
});
afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(storageDir, { recursive: true, force: true });
});

interface Victim {
  user: UserRow;
  modelId: string;
  photoId: string;
  jobId: string;
  batchId: string;
  mediaId: string;
  folderId: string;
  shareId: string;
  uploadId: string;
  maskUploadId: string;
  garmentUploadId: string;
  apiKeyId: string;
  teamId: string;
  memberId: string;
  kitId: string;
  teamInviteToken: string;
  mpInviteToken: string;
  mpShareId: string;
  reportId: string;
  moderationEventId: string;
}

let victim: Victim;
let attacker: UserRow;
let attackerKey: ApiKeyRow;
let attackerModelId: string;

async function jpeg(): Promise<Uint8Array> {
  return Uint8Array.from(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer(),
  );
}

async function seedVictim(): Promise<Victim> {
  const user = await createTestUser({ name: "Victor", plan: "studio", hasPaid: true, credits: 500 });
  const member = await createTestUser({ name: "Mia", email: "mia@example.com" });
  const model = await createTestModel(user.id, { name: "Victor" });
  const photoId = `tph_${newToken(12).toLowerCase()}`;
  const photoKey = storageKeys.trainingPhoto(user.id, model.id, photoId);
  await getStorage().put(photoKey, await jpeg(), { contentType: "image/jpeg" });
  await db.insert(schema.trainingPhotos).values({
    id: photoId,
    modelId: model.id,
    userId: user.id,
    storageKey: photoKey,
    width: 64,
    height: 64,
    status: "accepted",
  });
  const [batch] = await db
    .insert(schema.batches)
    .values({ userId: user.id, modelId: model.id, packId: "linkedin-headshots", total: 1 })
    .returning();
  const job = await createTestJob(user.id, { modelId: model.id, batchId: batch!.id, status: "running" });
  const [folder] = await db.insert(schema.folders).values({ userId: user.id, name: "Private" }).returning();
  const media = await createTestMedia(user.id, { jobId: job.id, modelId: model.id, folderId: folder!.id, batchId: batch!.id });
  await getStorage().put(media.storageKey, await jpeg(), { contentType: "image/jpeg" });
  const [share] = await db
    .insert(schema.shareLinks)
    .values({ token: newToken(), userId: user.id, mediaId: media.id })
    .returning();
  const upload = await createTestUpload(user.id);
  const mask = await createTestUpload(user.id, { purpose: "mask", mimeType: "image/png" });
  const garment = await createTestUpload(user.id, { purpose: "garment" });
  const { row: key } = await createApiKey(user.id, "victim key");

  const team = await createTeam(user, "Victor Inc");
  await inviteMember(user, team.id, member.email);
  const [memberRow] = await db
    .update(schema.teamMembers)
    .set({ status: "active", userId: member.id, inviteTokenHash: null })
    .where(eq(schema.teamMembers.email, member.email))
    .returning();
  const kit = await createBrandKit(user.id, team.id, { name: "Navy", backgroundPrompt: "navy backdrop" });
  // A pending team invite (token known) for someone else.
  const teamInviteToken = newToken();
  await db.insert(schema.teamMembers).values({
    teamId: team.id,
    email: "pending@example.com",
    role: "member",
    status: "invited",
    inviteTokenHash: (await import("@/server/teams/access")).hashInviteToken(teamInviteToken),
  });

  // Multi-person: a pending invite the victim sent to a friend, and an accepted share with the member.
  const mpInviteToken = newToken();
  await db.insert(schema.modelShares).values({
    requesterUserId: user.id,
    inviteeEmail: "friend@example.com",
    status: "pending",
    tokenHash: hashInviteToken(mpInviteToken),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const memberModel = await createTestModel(member.id, { name: "Mia" });
  const [mpShare] = await db
    .insert(schema.modelShares)
    .values({
      requesterUserId: user.id,
      inviteeEmail: member.email,
      ownerUserId: member.id,
      modelId: memberModel.id,
      status: "accepted",
      tokenHash: hashInviteToken(newToken()),
      expiresAt: new Date(Date.now() + 86_400_000),
      respondedAt: new Date(),
    })
    .returning();

  const [report] = await db
    .insert(schema.reports)
    .values({ mediaId: media.id, reason: "other", details: "x" } as typeof schema.reports.$inferInsert)
    .returning();
  const [event] = await db
    .insert(schema.moderationEvents)
    .values({ userId: user.id, kind: "prompt_blocked", details: {} } as typeof schema.moderationEvents.$inferInsert)
    .returning();

  return {
    user,
    modelId: model.id,
    photoId,
    jobId: job.id,
    batchId: batch!.id,
    mediaId: media.id,
    folderId: folder!.id,
    shareId: share!.id,
    uploadId: upload.id,
    maskUploadId: mask.id,
    garmentUploadId: garment.id,
    apiKeyId: key.id,
    teamId: team.id,
    memberId: memberRow!.id,
    kitId: kit.id,
    teamInviteToken,
    mpInviteToken,
    mpShareId: mpShare!.id,
    reportId: report!.id,
    moderationEventId: event!.id,
  };
}

/** Everything of the victim's, so a test can assert nothing changed. */
async function snapshot(v: Victim) {
  const pick = async <T>(rows: Promise<T[]>) => JSON.stringify(await rows);
  return {
    user: await pick(db.select().from(schema.user).where(eq(schema.user.id, v.user.id))),
    models: await pick(db.select().from(schema.identityModels).where(eq(schema.identityModels.userId, v.user.id))),
    photos: await pick(db.select().from(schema.trainingPhotos).where(eq(schema.trainingPhotos.userId, v.user.id))),
    jobs: await pick(db.select().from(schema.jobs).where(eq(schema.jobs.userId, v.user.id))),
    batches: await pick(db.select().from(schema.batches).where(eq(schema.batches.userId, v.user.id))),
    media: await pick(db.select().from(schema.media).where(eq(schema.media.userId, v.user.id))),
    folders: await pick(db.select().from(schema.folders).where(eq(schema.folders.userId, v.user.id))),
    shares: await pick(db.select().from(schema.shareLinks).where(eq(schema.shareLinks.userId, v.user.id))),
    uploads: await pick(db.select().from(schema.uploads).where(eq(schema.uploads.userId, v.user.id))),
    keys: await pick(db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, v.user.id))),
    teams: await pick(db.select().from(schema.teams).where(eq(schema.teams.id, v.teamId))),
    members: await pick(db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, v.teamId))),
    kits: await pick(db.select().from(schema.brandKits).where(eq(schema.brandKits.teamId, v.teamId))),
    modelShares: await pick(db.select().from(schema.modelShares).where(eq(schema.modelShares.requesterUserId, v.user.id))),
    reports: await pick(db.select().from(schema.reports).where(eq(schema.reports.id, v.reportId))),
    events: await pick(db.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.id, v.moderationEventId))),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers have per-route param types
type AnyHandler = (req: any, ctx: { params: Promise<any> }) => Promise<Response>;

interface Case {
  name: string;
  handler: AnyHandler;
  method?: string;
  url: string;
  params?: Record<string, string>;
  body?: unknown;
  /** Call with the attacker's API key instead of the session. */
  apiKey?: boolean;
}

function multipart(fields: Record<string, string | Blob>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

function cases(v: Victim): Case[] {
  const id = { id: v.modelId };
  const img = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], { type: "image/jpeg" });
  return [
    // Identity models
    { name: "GET model", handler: modelGet, url: `/api/models/${v.modelId}`, params: id },
    { name: "PATCH model", handler: modelPatch, method: "PATCH", url: `/api/models/${v.modelId}`, params: id, body: { name: "pwned" } },
    { name: "DELETE model", handler: modelDelete, method: "DELETE", url: `/api/models/${v.modelId}`, params: id },
    { name: "POST consent challenge", handler: consentChallenge, method: "POST", url: `/api/models/${v.modelId}/consent/challenge`, params: id },
    {
      name: "POST consent",
      handler: consentPost,
      url: `/api/models/${v.modelId}/consent`,
      params: id,
      body: multipart({ selfie: img, captureToken: "x" }),
    },
    { name: "POST photo", handler: photosPost, url: `/api/models/${v.modelId}/photos`, params: id, body: multipart({ file: img }) },
    {
      name: "DELETE photo",
      handler: photoDelete,
      method: "DELETE",
      url: `/api/models/${v.modelId}/photos/${v.photoId}`,
      params: { id: v.modelId, photoId: v.photoId },
    },
    {
      name: "DELETE victim photo through the attacker's own model",
      handler: photoDelete,
      method: "DELETE",
      url: `/api/models/${attackerModelId}/photos/${v.photoId}`,
      params: { id: attackerModelId, photoId: v.photoId },
    },
    { name: "POST train", handler: modelTrain, url: `/api/models/${v.modelId}/train`, params: id, body: { mode: "instant" } },
    { name: "v1 GET model", handler: v1ModelGet, url: `/api/v1/models/${v.modelId}`, params: id, apiKey: true },

    // Jobs + batches
    { name: "GET job", handler: jobGet, url: `/api/jobs/${v.jobId}`, params: { id: v.jobId } },
    { name: "POST cancel job", handler: jobCancel, url: `/api/jobs/${v.jobId}/cancel`, params: { id: v.jobId }, method: "POST" },
    { name: "GET batch", handler: batchGet, url: `/api/batches/${v.batchId}`, params: { id: v.batchId } },
    { name: "v1 GET job", handler: v1JobGet, url: `/api/v1/jobs/${v.jobId}`, params: { id: v.jobId }, apiKey: true },
    { name: "v1 POST cancel job", handler: v1JobCancel, method: "POST", url: `/api/v1/jobs/${v.jobId}/cancel`, params: { id: v.jobId }, apiKey: true },
    { name: "v1 GET batch", handler: v1BatchGet, url: `/api/v1/batches/${v.batchId}`, params: { id: v.batchId }, apiKey: true },
    // Jobs that reference the victim's resources (each handler's plan() must re-authorize them)
    { name: "generate with victim model", handler: jobsPost, url: "/api/jobs", body: { type: "generate", modelId: v.modelId, prompt: "portrait", numImages: 1 } },
    {
      name: "generate with victim reference upload",
      handler: jobsPost,
      url: "/api/jobs",
      body: { type: "generate", modelId: attackerModelId, prompt: "portrait", numImages: 1, referenceUploadId: v.uploadId },
    },
    {
      name: "generate from victim draft",
      handler: jobsPost,
      url: "/api/jobs",
      body: { type: "generate", modelId: attackerModelId, fromDraftMediaId: v.mediaId, numImages: 1 },
    },
    {
      name: "generate with victim brand kit",
      handler: jobsPost,
      url: "/api/jobs",
      body: { type: "generate", modelId: attackerModelId, prompt: "portrait", numImages: 1, brandKitId: v.kitId },
    },
    { name: "pose_copy with victim upload", handler: jobsPost, url: "/api/jobs", body: { type: "pose_copy", modelId: attackerModelId, referenceUploadId: v.uploadId } },
    { name: "edit victim media", handler: jobsPost, url: "/api/jobs", body: { type: "edit", sourceMediaId: v.mediaId, edit: "hair", instruction: "blonde" } },
    { name: "inpaint victim media", handler: jobsPost, url: "/api/jobs", body: { type: "inpaint", sourceMediaId: v.mediaId, maskUploadId: v.maskUploadId, prompt: "a hat" } },
    { name: "upscale victim media", handler: jobsPost, url: "/api/jobs", body: { type: "upscale", sourceMediaId: v.mediaId } },
    { name: "face_restore victim media", handler: jobsPost, url: "/api/jobs", body: { type: "face_restore", sourceMediaId: v.mediaId } },
    { name: "remove_background victim media", handler: jobsPost, url: "/api/jobs", body: { type: "remove_background", sourceMediaId: v.mediaId } },
    { name: "video from victim media", handler: jobsPost, url: "/api/jobs", body: { type: "video", sourceMediaId: v.mediaId } },
    { name: "talking video from victim media", handler: jobsPost, url: "/api/jobs", body: { type: "talking_video", sourceMediaId: v.mediaId, script: "hello there" } },
    { name: "try_on victim media", handler: jobsPost, url: "/api/jobs", body: { type: "try_on", personMediaId: v.mediaId, garmentUploadId: v.garmentUploadId } },
    { name: "multi_person with victim model", handler: jobsPost, url: "/api/jobs", body: { type: "multi_person", modelIds: [attackerModelId, v.modelId], prompt: "two friends" } },
    { name: "v1 edit victim media", handler: v1JobsPost, url: "/api/v1/jobs", body: { type: "upscale", sourceMediaId: v.mediaId }, apiKey: true },
    { name: "batch with victim model", handler: batchesPost, url: "/api/batches", body: { modelId: v.modelId, packId: "linkedin-headshots", count: 1 } },
    {
      name: "batch with victim brand kit",
      handler: batchesPost,
      url: "/api/batches",
      body: { modelId: attackerModelId, packId: "linkedin-headshots", count: 1, brandKitId: v.kitId },
    },
    { name: "v1 batch with victim model", handler: v1Batches, url: "/api/v1/batches", body: { modelId: v.modelId, packId: "linkedin-headshots", count: 1 }, apiKey: true },

    // Gallery
    { name: "GET media", handler: mediaGet, url: `/api/media/${v.mediaId}`, params: { id: v.mediaId } },
    { name: "PATCH media", handler: mediaPatch, method: "PATCH", url: `/api/media/${v.mediaId}`, params: { id: v.mediaId }, body: { isFavorite: true } },
    { name: "DELETE media", handler: mediaDelete, method: "DELETE", url: `/api/media/${v.mediaId}`, params: { id: v.mediaId } },
    { name: "v1 GET media", handler: v1MediaGet, url: `/api/v1/media/${v.mediaId}`, params: { id: v.mediaId }, apiKey: true },
    { name: "bulk delete media", handler: mediaBulk, url: "/api/media/bulk", body: { action: "delete", ids: [v.mediaId] } },
    { name: "bulk move media into victim folder", handler: mediaBulk, url: "/api/media/bulk", body: { action: "move", ids: [v.mediaId], folderId: v.folderId } },
    { name: "zip download media", handler: mediaDownload, url: "/api/media/download", body: { ids: [v.mediaId] } },
    { name: "PATCH folder", handler: folderPatch, method: "PATCH", url: `/api/folders/${v.folderId}`, params: { id: v.folderId }, body: { name: "pwned" } },
    { name: "DELETE folder", handler: folderDelete, method: "DELETE", url: `/api/folders/${v.folderId}`, params: { id: v.folderId } },
    { name: "share victim media", handler: sharePost, url: "/api/share", body: { mediaId: v.mediaId } },
    { name: "share victim folder", handler: sharePost, url: "/api/share", body: { folderId: v.folderId } },
    { name: "revoke victim share", handler: shareDelete, method: "DELETE", url: `/api/share/${v.shareId}`, params: { id: v.shareId } },
    { name: "DELETE upload", handler: uploadDelete, method: "DELETE", url: `/api/uploads/${v.uploadId}`, params: { id: v.uploadId } },
    { name: "DELETE API key", handler: apiKeyDelete, method: "DELETE", url: `/api/api-keys/${v.apiKeyId}`, params: { id: v.apiKeyId } },

    // Teams + brand kits
    { name: "GET team", handler: teamGet, url: `/api/teams/${v.teamId}`, params: { id: v.teamId } },
    { name: "PATCH team", handler: teamPatch, method: "PATCH", url: `/api/teams/${v.teamId}`, params: { id: v.teamId }, body: { name: "pwned" } },
    { name: "DELETE team", handler: teamDelete, method: "DELETE", url: `/api/teams/${v.teamId}`, params: { id: v.teamId } },
    { name: "invite into team", handler: teamInvite, url: `/api/teams/${v.teamId}/invites`, params: { id: v.teamId }, body: { email: "spy@example.com" } },
    {
      name: "remove team member",
      handler: memberDelete,
      method: "DELETE",
      url: `/api/teams/${v.teamId}/members/${v.memberId}`,
      params: { id: v.teamId, memberId: v.memberId },
    },
    {
      name: "promote team member",
      handler: memberPatch,
      method: "PATCH",
      url: `/api/teams/${v.teamId}/members/${v.memberId}`,
      params: { id: v.teamId, memberId: v.memberId },
      body: { role: "admin" },
    },
    { name: "list team brand kits", handler: teamKitsGet, url: `/api/teams/${v.teamId}/brand-kits`, params: { id: v.teamId } },
    { name: "create team brand kit", handler: teamKitsPost, url: `/api/teams/${v.teamId}/brand-kits`, params: { id: v.teamId }, body: { name: "Spy" } },
    { name: "PATCH brand kit", handler: kitPatch, method: "PATCH", url: `/api/brand-kits/${v.kitId}`, params: { id: v.kitId }, body: { name: "pwned" } },
    { name: "DELETE brand kit", handler: kitDelete, method: "DELETE", url: `/api/brand-kits/${v.kitId}`, params: { id: v.kitId } },
    { name: "transfer team credits", handler: teamTransfer, url: `/api/teams/${v.teamId}/credits/transfer`, params: { id: v.teamId }, body: { memberUserId: attacker.id, amount: 10 } },
    { name: "accept someone else's team invite", handler: teamAccept, url: `/api/teams/invites/${v.teamInviteToken}/accept`, params: { token: v.teamInviteToken }, method: "POST" },

    // Multi-person consent
    { name: "accept someone else's together invite", handler: mpAccept, url: `/api/multi-person/invites/${v.mpInviteToken}/accept`, params: { token: v.mpInviteToken }, body: { modelId: attackerModelId } },
    { name: "decline someone else's together invite", handler: mpDecline, url: `/api/multi-person/invites/${v.mpInviteToken}/decline`, params: { token: v.mpInviteToken }, method: "POST" },
    { name: "revoke someone else's together share", handler: mpShareDelete, method: "DELETE", url: `/api/multi-person/shares/${v.mpShareId}`, params: { id: v.mpShareId } },

    // Admin (attacker is not an admin)
    { name: "admin stats", handler: adminStats, url: "/api/admin/stats" },
    { name: "admin users", handler: adminUsers, url: "/api/admin/users" },
    { name: "admin user", handler: adminUser, url: `/api/admin/users/${v.user.id}`, params: { id: v.user.id } },
    { name: "admin credits", handler: adminCredits, url: `/api/admin/users/${attacker.id}/credits`, params: { id: attacker.id }, body: { delta: 1000, note: "gift" } },
    { name: "admin suspend", handler: adminSuspend, url: `/api/admin/users/${v.user.id}/suspend`, params: { id: v.user.id }, body: { reason: "x" } },
    { name: "admin unsuspend", handler: adminUnsuspend, method: "POST", url: `/api/admin/users/${v.user.id}/unsuspend`, params: { id: v.user.id } },
    { name: "admin jobs", handler: adminJobs, url: "/api/admin/jobs" },
    { name: "admin refund", handler: adminRefund, method: "POST", url: `/api/admin/jobs/${v.jobId}/refund`, params: { id: v.jobId }, body: {} },
    { name: "admin moderation", handler: adminModeration, url: "/api/admin/moderation" },
    { name: "admin review event", handler: adminReview, method: "POST", url: `/api/admin/moderation-events/${v.moderationEventId}/review`, params: { id: v.moderationEventId } },
    { name: "admin resolve report", handler: adminResolve, url: `/api/admin/reports/${v.reportId}/resolve`, params: { id: v.reportId }, body: { action: "remove_media", note: "x" } },
  ];
}

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  victim = await seedVictim();
  attacker = await createTestUser({ name: "Mallory", plan: "studio", hasPaid: true, credits: 500 });
  attackerModelId = (await createTestModel(attacker.id, { name: "Mallory" })).id;
  attackerKey = (await createApiKey(attacker.id, "attacker key")).row;
});

describe("IDOR: another user's ids", () => {
  it("every id-taking route answers 403/404 and changes nothing", async () => {
    const before = await snapshot(victim);
    const leaks: string[] = [];
    for (const c of cases(victim)) {
      sessionMock.setUser(attacker, { apiKey: c.apiKey ? attackerKey : null });
      const res = await callRoute(c.handler, {
        method: c.method,
        url: c.url,
        params: c.params,
        body: c.body,
        headers: c.apiKey ? { authorization: "Bearer os_live_attacker" } : {},
      });
      if (res.status !== 403 && res.status !== 404) {
        leaks.push(`${c.name}: ${res.status} ${JSON.stringify(res.json)?.slice(0, 200)}`);
      }
    }
    expect(leaks).toEqual([]);
    expect(await snapshot(victim)).toEqual(before);
  });

  it("list routes filtered by the victim's ids return none of the victim's data", async () => {
    sessionMock.setUser(attacker);
    for (const q of [`folderId=${victim.folderId}`, `modelId=${victim.modelId}`, `batchId=${victim.batchId}`, "showHidden=true"]) {
      const res = await callRoute(mediaList, { url: `/api/media?${q}` });
      expect(JSON.stringify(res.json), q).not.toContain(victim.mediaId);
    }
    const jobs = await callRoute(jobsGet, { url: `/api/jobs?ids=${victim.jobId}` });
    expect(JSON.stringify(jobs.json)).not.toContain(victim.jobId);
    const shares = await callRoute(sharesGet, { url: `/api/share?mediaId=${victim.mediaId}` });
    expect(JSON.stringify(shares.json)).not.toContain(victim.shareId);

    sessionMock.setUser(attacker, { apiKey: attackerKey });
    const v1 = await callRoute(v1Media, { url: `/api/v1/media?folderId=${victim.folderId}` });
    expect(JSON.stringify(v1.json)).not.toContain(victim.mediaId);
    const v1j = await callRoute(v1Jobs, { url: `/api/v1/jobs?ids=${victim.jobId}` });
    expect(JSON.stringify(v1j.json)).not.toContain(victim.jobId);
  });

  it("an attacker's own media can't be moved into the victim's folder", async () => {
    sessionMock.setUser(attacker);
    const mine = await createTestMedia(attacker.id);
    const patched = await callRoute(mediaPatch, {
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      params: { id: mine.id },
      body: { folderId: victim.folderId },
    });
    expect([403, 404]).toContain(patched.status);
    const bulk = await callRoute(mediaBulk, { url: "/api/media/bulk", body: { action: "move", ids: [mine.id], folderId: victim.folderId } });
    expect([403, 404]).toContain(bulk.status);
    const [row] = await db.select().from(schema.media).where(eq(schema.media.id, mine.id));
    expect(row!.folderId).toBeNull();
  });
});

describe("control: the same reads work for the owner", () => {
  it("so a 404 above means 'not yours', not a broken case", async () => {
    const ownerKey = (await createApiKey(victim.user.id, "owner key")).row;
    for (const c of cases(victim).filter((x) => (x.method ?? (x.body ? "POST" : "GET")) === "GET" && !x.name.startsWith("admin"))) {
      sessionMock.setUser(victim.user, { apiKey: c.apiKey ? ownerKey : null });
      const res = await callRoute(c.handler, { url: c.url, params: c.params });
      expect(res.status, c.name).toBe(200);
    }
  });
});
