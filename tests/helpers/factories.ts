/**
 * Row factories for unit tests (call `await createTestDb()` first). Every factory takes the
 * owner's userId plus column overrides and returns the inserted row.
 *
 *   const user = await createTestUser({ credits: 50 });
 *   const model = await createTestModel(user.id);                       // status "ready", mock LoRA
 *   const job = await createTestJob(user.id, { modelId: model.id, creditsCharged: 4 });
 *   const media = await createTestMedia(user.id, { jobId: job.id });
 *
 * Route tests: see `sessionMock` (./session) and `callRoute` (./route), re-exported here.
 */
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { IdentityModelRow, JobRow, MediaRow, NewJobRow, NewMediaRow, UploadRow } from "@/db/types";
import { newId, newTriggerWord } from "@/lib/ids";
import { storageKeys } from "@/server/storage";
import { jobInputSchema, type JobInput } from "@/types/domain";

export { createTestDb, createTestUser } from "./db";
export { callRoute, type CallRouteOptions, type CallRouteResult } from "./route";
export { sessionMock } from "./session";

/** Fixed L2-normalized 128-d face embedding used as the default consent embedding. */
export const TEST_FACE_EMBEDDING: readonly number[] = Object.freeze(
  Array.from({ length: 128 }, (_, i) => (i === 0 ? 1 : 0)),
);

export async function createTestModel(
  userId: string,
  overrides: Partial<typeof schema.identityModels.$inferInsert> = {},
): Promise<IdentityModelRow> {
  const now = new Date();
  const [row] = await db
    .insert(schema.identityModels)
    .values({
      id: newId("mdl"),
      name: "Test Model",
      subject: "person",
      triggerWord: newTriggerWord(),
      status: "ready",
      provider: "mock",
      providerModelRef: "mock-lora://x",
      consentEmbedding: [...TEST_FACE_EMBEDDING],
      consentVerifiedAt: now,
      trainedAt: now,
      metadata: { mode: "trained" },
      ...overrides,
      userId,
    })
    .returning();
  return row!;
}

/** Defaults to a queued 1-image "generate" job. `input` is validated with `jobInputSchema`. */
export async function createTestJob(userId: string, overrides: Partial<NewJobRow> = {}): Promise<JobRow> {
  const input: JobInput = jobInputSchema.parse(
    overrides.input ?? {
      type: "generate",
      modelId: overrides.modelId ?? "mdl_test",
      prompt: "studio portrait of {subject}",
      numImages: 1,
    },
  );
  const [row] = await db
    .insert(schema.jobs)
    .values({
      id: newId("job"),
      status: "queued",
      provider: "mock",
      ...overrides,
      type: overrides.type ?? input.type,
      input,
      userId,
    })
    .returning();
  return row!;
}

/** Defaults to a 1024×1280 JPEG image stored under the user's media prefix. */
export async function createTestMedia(userId: string, overrides: Partial<NewMediaRow> = {}): Promise<MediaRow> {
  const id = overrides.id ?? newId("med");
  const [row] = await db
    .insert(schema.media)
    .values({
      kind: "image",
      storageKey: storageKeys.media(userId, id, "jpg"),
      thumbKey: storageKeys.mediaThumb(userId, id),
      mimeType: "image/jpeg",
      bytes: 1024,
      width: 1024,
      height: 1280,
      prompt: "studio portrait",
      ...overrides,
      id,
      userId,
    })
    .returning();
  return row!;
}

/** Defaults to a 1024×1024 JPEG "reference" upload. */
export async function createTestUpload(
  userId: string,
  overrides: Partial<typeof schema.uploads.$inferInsert> = {},
): Promise<UploadRow> {
  const id = overrides.id ?? newId("upl");
  const [row] = await db
    .insert(schema.uploads)
    .values({
      purpose: "reference",
      storageKey: storageKeys.upload(userId, id, "jpg"),
      mimeType: "image/jpeg",
      bytes: 1024,
      width: 1024,
      height: 1024,
      ...overrides,
      id,
      userId,
    })
    .returning();
  return row!;
}
