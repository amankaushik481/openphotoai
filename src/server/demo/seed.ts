/**
 * Creates a ready-to-use demo account through the app's real code paths: credits on the ledger,
 * an Instant identity model built from synthetic selfies (consent safety check, photo quality +
 * safety analysis and the instant-training gate all run against the mock providers) and a first
 * pack batch submitted through the job engine.
 *
 * Demo mode is mock-only (env.ts refuses DEMO_MODE with a real AI or payment provider), so no real
 * person is involved: the consent record says so (`captureMethod: "demo-seed"`, see ./consent).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { deleteAccountCompletely } from "@/server/account";
import { applyCredit } from "@/server/credits/ledger";
import { createModel } from "@/server/models/crud";
import { addTrainingPhoto } from "@/server/models/photos";
import { startTraining } from "@/server/models/training";
import {
  DEMO_BATCH_SIZE,
  DEMO_CREDITS,
  DEMO_PACK_SLUG,
  DEMO_USER_NAME,
  demoEmail,
} from "./constants";
import { seedDemoConsent } from "./consent";
import { demoSelfies } from "./selfies";

export interface DemoRequestInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DemoAccount {
  user: UserRow;
  model: IdentityModelRow;
  /** The first batch, or null when it couldn't be started (the account is still usable). */
  batchId: string | null;
}

/**
 * Inserted directly rather than through Better Auth's sign-up: no welcome email to an undeliverable
 * address and no signup bonus (demo credits are granted below). Role is always "user".
 */
async function insertDemoUser(): Promise<UserRow> {
  const [row] = await db
    .insert(userTable)
    .values({
      id: newId("usr"),
      name: DEMO_USER_NAME,
      email: demoEmail(randomBytes(9).toString("hex")),
      emailVerified: true,
      role: "user",
    })
    .returning();
  return row!;
}

async function seedReadyModel(user: UserRow, info: DemoRequestInfo): Promise<IdentityModelRow> {
  const [consentSelfie, ...photos] = await demoSelfies();
  const created = await createModel(user, { name: "Demo model", subject: "person" });
  const model = await seedDemoConsent({
    user,
    model: created,
    selfie: consentSelfie!,
    ipAddress: info.ipAddress,
    userAgent: info.userAgent,
  });

  // The regular upload path: normalize, quality + safety analysis (must match the consent selfie).
  for (const photo of photos) await addTrainingPhoto(user, model.id, photo);
  const { model: ready } = await startTraining(user, model.id, "instant");
  return ready;
}

/** Best effort: a missing pack or a provider hiccup must not cost the visitor their demo. */
async function startFirstBatch(user: UserRow, model: IdentityModelRow): Promise<string | null> {
  try {
    const { createBatch } = await import("@/server/jobs/engine"); // lazy: pulls in every job handler
    const { batch } = await createBatch(user, {
      modelId: model.id,
      packId: DEMO_PACK_SLUG,
      count: DEMO_BATCH_SIZE,
      quality: "standard",
    });
    return batch.id;
  } catch (err) {
    console.error(`[demo] couldn't start the first batch for ${user.id}:`, err);
    return null;
  }
}

/**
 * Create a demo user with DEMO_CREDITS credits, a ready Instant model and a first batch. A failure
 * before the model is ready removes the half-made account again and rethrows.
 */
export async function createDemoAccount(info: DemoRequestInfo): Promise<DemoAccount> {
  const user = await insertDemoUser();
  let model: IdentityModelRow;
  try {
    await applyCredit({
      userId: user.id,
      delta: DEMO_CREDITS,
      reason: "admin_adjust",
      idempotencyKey: `demo:${user.id}:grant`,
      note: "demo",
    });
    model = await seedReadyModel(user, info);
  } catch (err) {
    const report = await deleteAccountCompletely(user.id);
    if (report.error) console.error(`[demo] couldn't remove half-created demo account ${user.id}: ${report.error}`);
    throw err;
  }
  const [fresh] = await db.select().from(userTable).where(eq(userTable.id, user.id)).limit(1);
  const current = fresh ?? user;
  return { user: current, model, batchId: await startFirstBatch(current, model) };
}
