import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LocalStorageProvider } from "@/providers/storage/local";
import { createMediaZipStream, zipEntryName, zipFileName } from "@/server/gallery/zip";
import { createTestDb, createTestUser } from "../../helpers/factories";
import { seedMedia, useTempStorage } from "./helpers";

let storage: LocalStorageProvider;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ storage, cleanup } = await useTempStorage());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await createTestDb();
});

async function collect(stream: ReadableStream<Uint8Array>): Promise<{ bytes: Uint8Array; chunks: number }> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return { bytes, chunks: parts.length };
}

describe("createMediaZipStream", () => {
  it("streams entries as stored (no compression) with matching bytes", async () => {
    const user = await createTestUser();
    const big = new Uint8Array(256 * 1024).map((_, i) => (i * 31) % 251);
    const a = await seedMedia(user.id, 1);
    await storage.put(a.storageKey, big, { contentType: "image/jpeg" });
    const b = await seedMedia(user.id, 2, { kind: "video", mimeType: "video/mp4" }, { storage });

    const { bytes, chunks } = await collect(createMediaZipStream([a, b], { storage }));
    expect(chunks).toBeGreaterThan(2); // emitted incrementally, not as one buffer
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual([zipEntryName(a), zipEntryName(b)]);
    expect(files[zipEntryName(a)]).toEqual(big);
    // Stored entries: the archive is barely larger than its contents.
    expect(bytes.length).toBeLessThan(big.length + 2048);
  });

  it("skips unreadable files and lists them in MISSING.txt", async () => {
    const user = await createTestUser();
    const ok = await seedMedia(user.id, 1, {}, { storage });
    const gone = await seedMedia(user.id, 2); // no stored object
    const files = unzipSync((await collect(createMediaZipStream([ok, gone], { storage }))).bytes);
    expect(Object.keys(files)).toEqual([zipEntryName(ok), "MISSING.txt"]);
    expect(strFromU8(files["MISSING.txt"]!)).toContain(gone.id);
  });

  it("produces an empty but valid archive for no rows and can be cancelled", async () => {
    expect(Object.keys(unzipSync((await collect(createMediaZipStream([], { storage }))).bytes))).toEqual([]);
    const user = await createTestUser();
    const a = await seedMedia(user.id, 1, {}, { storage });
    const reader = createMediaZipStream([a, a], { storage }).getReader();
    await reader.read();
    await expect(reader.cancel()).resolves.toBeUndefined();
  });

  it("names files and archives after the brand and date", () => {
    expect(zipEntryName({ id: "med_x", createdAt: new Date("2026-03-04T10:00:00Z"), mimeType: "image/png" })).toBe(
      "openshoot-2026-03-04-med_x.png",
    );
    expect(zipFileName(new Date("2026-11-24T23:00:00Z"))).toBe("openshoot-2026-11-24.zip");
  });
});
