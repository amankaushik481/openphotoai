/** Fixtures for Together (multi-person) tests. Call `createTestDb()` first. */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox, modelShares, moderationEvents, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow, ModelShareRow, UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { createLocalStorage } from "@/providers/storage/local";
import { getStorage, setStorageForTesting, storageKeys } from "@/server/storage";
import { DAY_MS } from "@/server/together/constants";
import { hashInviteToken } from "@/server/together/tokens";
import type { InviteStatus, ModerationEventKind } from "@/types/domain";

/** Fresh local storage in a temp dir; returns a cleanup function. */
export async function useTempStorage(): Promise<() => Promise<void>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-together-"));
  setStorageForTesting(createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "together-test-secret" }));
  return async () => {
    setStorageForTesting(null);
    await fs.rm(dir, { recursive: true, force: true });
  };
}

async function pngBytes(): Promise<Uint8Array> {
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 140, b: 160 } } })
    .png()
    .toBuffer();
  return Uint8Array.from(buf);
}

/** Store an accepted training photo for `model` (reference photo for together photos). */
export async function addReferencePhoto(model: IdentityModelRow): Promise<void> {
  const id = `tph_${newToken(12).toLowerCase()}`;
  const key = storageKeys.trainingPhoto(model.userId, model.id, id);
  await getStorage().put(key, await pngBytes(), { contentType: "image/png" });
  await db
    .insert(trainingPhotos)
    .values({
      id,
      modelId: model.id,
      userId: model.userId,
      storageKey: key,
      width: 64,
      height: 64,
      status: "accepted",
    });
}

/** Insert a model_shares row directly (default: accepted, valid for 30 days). Returns the row + its token. */
export async function insertShare(opts: {
  requester: UserRow;
  owner?: UserRow | null;
  model?: IdentityModelRow | null;
  status?: InviteStatus;
  email?: string;
  expiresAt?: Date;
}): Promise<{ share: ModelShareRow; token: string }> {
  const token = newToken();
  const status = opts.status ?? "accepted";
  const [share] = await db
    .insert(modelShares)
    .values({
      requesterUserId: opts.requester.id,
      inviteeEmail: (opts.email ?? opts.owner?.email ?? "friend@example.com").toLowerCase(),
      ownerUserId: status === "accepted" ? (opts.owner?.id ?? null) : null,
      modelId: status === "accepted" ? (opts.model?.id ?? null) : null,
      status,
      tokenHash: hashInviteToken(token),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * DAY_MS),
      respondedAt: status === "pending" ? null : new Date(),
    })
    .returning();
  return { share: share!, token };
}

export async function getShare(id: string): Promise<ModelShareRow> {
  const [row] = await db.select().from(modelShares).where(eq(modelShares.id, id));
  return row!;
}

/** Token from the latest invite email sent to `to` (as the invitee would click it). */
export async function tokenFromLatestEmail(to: string): Promise<string> {
  const [mail] = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.to, to), eq(emailOutbox.template, "multi_person_invite")))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  const match = /\/invites\/([A-Za-z0-9]+)/.exec(mail?.text ?? "");
  if (!match) throw new Error(`no invite link in the email to ${to}`);
  return match[1]!;
}

export async function eventsOf(userId: string, kind: ModerationEventKind) {
  return db
    .select()
    .from(moderationEvents)
    .where(and(eq(moderationEvents.userId, userId), eq(moderationEvents.kind, kind)));
}
