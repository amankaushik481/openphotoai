import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { isLocalStorage } from "@/providers/storage/local";
import type { StorageProvider } from "@/providers/types";
import { getStorage, setStorageForTesting, signedUrl, storageKeys } from "@/server/storage";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  setStorageForTesting(null);
});

describe("getStorage", () => {
  it("defaults to the local driver configured from env, cached per process", () => {
    const s = getStorage();
    expect(s.name).toBe("local");
    expect(isLocalStorage(s) && s.dir).toBe(path.resolve("./.data/test-storage"));
    expect(s.publiclyReachable).toBe(false);
    expect(getStorage()).toBe(s);
  });

  it("signs local URLs against NEXT_PUBLIC_APP_URL", async () => {
    const url = await signedUrl(storageKeys.media("usr_1", "med_1", "jpg"), { downloadName: "a.jpg" });
    expect(url).toMatch(/^http:\/\/localhost:3000\/api\/files\/users\/usr_1\/media\/med_1\.jpg\?exp=\d+&sig=[\w-]+&dl=a\.jpg$/);
  });

  it("builds the S3 driver when STORAGE_DRIVER=s3", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    resetEnvCache();
    setStorageForTesting(null);
    const s = getStorage();
    expect(s.name).toBe("s3");
    expect(s.publiclyReachable).toBe(true);
  });

  it("honours the test override", async () => {
    const fake: StorageProvider = {
      name: "s3",
      publiclyReachable: true,
      put: vi.fn(),
      get: vi.fn(),
      exists: vi.fn(),
      delete: vi.fn(),
      deletePrefix: vi.fn(),
      getSignedUrl: vi.fn(async (key: string) => `https://cdn.test/${key}`),
    };
    setStorageForTesting(fake);
    expect(getStorage()).toBe(fake);
    expect(await signedUrl("users/u1/a.jpg")).toBe("https://cdn.test/users/u1/a.jpg");
    setStorageForTesting(null);
    expect(getStorage().name).toBe("local");
  });

  it("keeps every user's objects under users/{userId}/", () => {
    const prefix = storageKeys.userPrefix("usr_1");
    for (const key of [
      storageKeys.modelPrefix("usr_1", "mdl_1"),
      storageKeys.consentSelfie("usr_1", "mdl_1", "c1"),
      storageKeys.trainingPhoto("usr_1", "mdl_1", "p1"),
      storageKeys.trainingZip("usr_1", "mdl_1", "job_1"),
      storageKeys.media("usr_1", "med_1", "png"),
      storageKeys.mediaThumb("usr_1", "med_1"),
      storageKeys.upload("usr_1", "upl_1", "jpg"),
    ]) {
      expect(key.startsWith(prefix)).toBe(true);
    }
  });
});
