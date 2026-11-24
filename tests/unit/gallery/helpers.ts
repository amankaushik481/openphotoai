/** Shared setup for gallery tests: temp local storage + media rows with real stored objects. */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MediaRow, NewMediaRow } from "@/db/types";
import { createLocalStorage, type LocalStorageProvider } from "@/providers/storage/local";
import { setStorageForTesting } from "@/server/storage";
import { createTestMedia } from "../../helpers/factories";

export async function useTempStorage(): Promise<{ storage: LocalStorageProvider; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-gallery-"));
  const storage = createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "gallery-test-secret" });
  setStorageForTesting(storage);
  return {
    storage,
    cleanup: async () => {
      setStorageForTesting(null);
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** Deterministic fake file content for a media row. */
export function bytesFor(id: string): Uint8Array {
  return new TextEncoder().encode(`media-bytes:${id}`);
}

const BASE_TIME = Date.parse("2026-11-01T12:00:00.000Z");

/**
 * Insert a media row (createdAt = base + `minute` minutes, so ordering is deterministic) and,
 * with `store`, write its original + thumbnail to storage.
 */
export async function seedMedia(
  userId: string,
  minute: number,
  overrides: Partial<NewMediaRow> = {},
  opts: { storage?: LocalStorageProvider } = {},
): Promise<MediaRow> {
  const row = await createTestMedia(userId, { createdAt: new Date(BASE_TIME + minute * 60_000), ...overrides });
  if (opts.storage) {
    await opts.storage.put(row.storageKey, bytesFor(row.id), { contentType: row.mimeType });
    if (row.thumbKey) await opts.storage.put(row.thumbKey, bytesFor(`${row.id}:thumb`), { contentType: "image/webp" });
  }
  return row;
}
