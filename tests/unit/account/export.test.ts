import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportRoute } from "@/app/api/account/export/route";
import { exportAccountData, EXPORT_FORMAT } from "@/server/account/export";
import type { LocalStorageProvider } from "@/providers/storage/local";
import { callRoute, createTestDb, sessionMock, TEST_FACE_EMBEDDING } from "../../helpers/factories";
import { seedAccount, useTempStorage, type SeededAccount } from "./fixtures";

vi.mock("@/server/auth/session", () => sessionMock);

let storage: LocalStorageProvider;
let cleanup: () => Promise<void>;
let seeded: SeededAccount;
let other: SeededAccount;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  ({ storage, cleanup } = await useTempStorage());
  seeded = await seedAccount(storage, "ada@example.com");
  other = await seedAccount(storage, "grace@example.com");
});

afterEach(async () => {
  await cleanup();
});

/** `exp` (unix seconds) of a local signed URL. */
function expiryOf(url: string): number {
  return Number(new URL(url).searchParams.get("exp"));
}

describe("exportAccountData", () => {
  it("exports the user's records with 24h signed URLs and nothing of other accounts", async () => {
    const data = await exportAccountData(seeded.user.id);
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.profile).toMatchObject({ id: seeded.user.id, email: "ada@example.com", name: "Ada" });
    expect(data.signInMethods.map((m) => m.providerId)).toEqual(["email", "google"]);
    expect(data.identityModels.map((m) => m.id).sort()).toEqual([...seeded.modelIds].sort());
    expect(data.identityModels.map((m) => m.mode).sort()).toEqual(["instant", "trained"]);
    expect(data.trainingPhotos).toHaveLength(1);
    expect(data.media).toEqual([expect.objectContaining({ id: seeded.mediaId, prompt: "me on a yacht" })]);
    expect(data.uploads).toEqual([expect.objectContaining({ id: seeded.uploadId })]);
    expect(data.jobs).toEqual([expect.objectContaining({ id: seeded.jobId, type: "generate" })]);
    expect(data.creditLedger).toHaveLength(1);
    expect(data.payments).toEqual([expect.objectContaining({ amountCents: 3900, status: "paid" })]);
    expect(data.subscriptions).toEqual([expect.objectContaining({ planId: "pro", status: "active" })]);
    expect(data.shareLinks).toEqual([
      expect.objectContaining({ mediaId: seeded.mediaId, url: `http://localhost:3000/s/${seeded.shareToken}` }),
    ]);
    expect(data.apiKeys).toEqual([expect.objectContaining({ name: "ci", prefix: "os_live_abcd" })]);
    expect(data.teamsOwned).toEqual([
      expect.objectContaining({ name: "Ada & Co", brandKits: [expect.objectContaining({ name: "Default" })] }),
    ]);
    expect(data.teamMemberships).toEqual([expect.objectContaining({ teamName: "Ada & Co", role: "owner" })]);

    // Every file comes with a signed URL valid for 24 hours that really serves the file.
    const urls = [
      ...data.media.map((m) => m.url),
      ...data.uploads.map((u) => u.url),
      ...data.trainingPhotos.map((p) => p.url),
      data.identityModels.find((m) => m.id === seeded.modelIds[0])!.consentSelfieUrl,
    ];
    expect(urls).toHaveLength(4);
    const in24h = Date.now() / 1000 + 24 * 3600;
    for (const url of urls) {
      expect(url).toMatch(/^http:\/\/localhost:3000\/api\/files\/users\//);
      // Signed against an hourly window (stable, cacheable URLs): valid for 24h to 25h.
      expect(expiryOf(url!) - in24h).toBeGreaterThan(-60);
      expect(expiryOf(url!) - in24h).toBeLessThan(3600 + 60);
      const key = decodeURIComponent(new URL(url!).pathname.replace("/api/files/", ""));
      expect(seeded.storageKeys).toContain(key);
    }

    const json = JSON.stringify(data);
    expect(json).not.toContain(other.user.id);
    expect(json).not.toContain(other.mediaId);
  });

  it("leaves out embeddings, secrets and provider internals", async () => {
    const json = JSON.stringify(await exportAccountData(seeded.user.id));
    expect(json).not.toMatch(/embedding/i);
    expect(json).not.toContain(JSON.stringify(TEST_FACE_EMBEDDING));
    expect(json).not.toContain(`hash_${seeded.user.id}`); // API key hash
    expect(json).not.toContain(`tok_${seeded.user.id}`); // session token
    expect(json).not.toContain(`req_${seeded.user.id}`); // provider request id
    expect(json).not.toContain("mock-lora://"); // provider model weights
    expect(json).not.toContain("stripeCustomerId");
    expect(json).not.toMatch(/"storageKey"|"keyHash"|"tokenHash"|"accessToken"/);
  });

  it("throws not_found for a deleted account", async () => {
    await expect(exportAccountData("usr_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("GET /api/account/export", () => {
  it("401 when signed out", async () => {
    const res = await callRoute(exportRoute, { url: "/api/account/export" });
    expect(res.status).toBe(401);
  });

  it("downloads the signed-in user's export as a JSON attachment", async () => {
    sessionMock.setUser(seeded.user);
    const res = await callRoute(exportRoute, { url: "/api/account/export" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="openshoot-export-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.json.profile.id).toBe(seeded.user.id);
    expect(res.json.media).toHaveLength(1);
  });
});
