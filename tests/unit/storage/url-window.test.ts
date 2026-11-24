import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStorage, verifyLocalFileSignature } from "@/providers/storage/local";
import { MAX_SIGNED_URL_TTL_SEC, signedObjectCacheControl, signingWindow } from "@/providers/storage/url-window";
import type { StorageProvider } from "@/providers/types";
import { setStorageForTesting, signedUrl } from "@/server/storage";

const SECRET = "url-window-test-secret";
const at = (iso: string) => new Date(iso).getTime();

describe("signingWindow", () => {
  it("is identical for every request inside one window and valid for at least the TTL", () => {
    const a = signingWindow(3600, at("2026-03-01T10:00:00Z"));
    const b = signingWindow(3600, at("2026-03-01T10:59:59Z"));
    expect(b).toEqual(a);
    expect(a.signedAtSec).toBe(at("2026-03-01T10:00:00Z") / 1000);
    expect(a.expiresAtSec).toBe(at("2026-03-01T12:00:00Z") / 1000);
    // Worst case (end of the window): still >= TTL left.
    expect(a.expiresAtSec - at("2026-03-01T10:59:59Z") / 1000).toBeGreaterThanOrEqual(3600);

    const next = signingWindow(3600, at("2026-03-01T11:00:00Z"));
    expect(next.signedAtSec).toBe(a.signedAtSec + 3600);
  });

  it("keeps short-lived URLs short (window <= TTL, lifetime <= 2x TTL)", () => {
    const w = signingWindow(600, at("2026-03-01T10:07:00Z"));
    expect(w.windowSec).toBe(600);
    expect(w.signedAtSec).toBe(at("2026-03-01T10:00:00Z") / 1000);
    expect(w.expiresInSec).toBe(1200);
  });

  it("does not bucket TTLs that would exceed the 7-day cap", () => {
    const now = at("2026-03-01T10:07:13Z");
    const w = signingWindow(30 * 24 * 3600, now);
    expect(w).toMatchObject({ ttlSec: MAX_SIGNED_URL_TTL_SEC, windowSec: 0, signedAtSec: now / 1000 });
    expect(w.expiresInSec).toBe(MAX_SIGNED_URL_TTL_SEC);
    // A 6.5-day TTL only gets the remaining half day as its window.
    expect(signingWindow(MAX_SIGNED_URL_TTL_SEC - 1800, now).windowSec).toBe(1800);
  });

  it("formats Cache-Control for immutable objects", () => {
    expect(signedObjectCacheControl(3600.7)).toBe("private, max-age=3600, immutable");
    expect(signedObjectCacheControl(-5)).toBe("private, max-age=0, immutable");
  });
});

describe("local driver + signedUrl memo", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-urlwin-"));
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    setStorageForTesting(null);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns the same local URL for the whole window and a new one after it", async () => {
    const storage = createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: SECRET });
    vi.setSystemTime(new Date("2026-03-01T10:00:01Z"));
    const first = await storage.getSignedUrl("users/u1/media/m1.jpg");
    vi.setSystemTime(new Date("2026-03-01T10:42:00Z"));
    expect(await storage.getSignedUrl("users/u1/media/m1.jpg")).toBe(first);
    vi.setSystemTime(new Date("2026-03-01T11:00:00Z"));
    const second = await storage.getSignedUrl("users/u1/media/m1.jpg");
    expect(second).not.toBe(first);

    // Both still verify right now (the older one has >= 1h left at the end of its window).
    for (const url of [first, second]) {
      const u = new URL(url);
      const key = decodeURIComponent(u.pathname.replace("/api/files/", ""));
      expect(
        verifyLocalFileSignature(key, u.searchParams.get("exp"), u.searchParams.get("sig"), null, {
          secret: SECRET,
          nowSec: at("2026-03-01T11:00:00Z") / 1000,
        }),
      ).toBe(true);
    }
  });

  it("signs each URL once per window and provider", async () => {
    const getSignedUrl = vi.fn(async (key: string) => `https://cdn.test/${key}?n=${getSignedUrl.mock.calls.length}`);
    const fake = { name: "s3", publiclyReachable: true, getSignedUrl } as unknown as StorageProvider;
    setStorageForTesting(fake);

    vi.setSystemTime(new Date("2026-03-01T10:10:00Z"));
    const a = await signedUrl("users/u1/a.jpg");
    expect(await signedUrl("users/u1/a.jpg")).toBe(a);
    // Different download name / TTL / key are different URLs.
    await signedUrl("users/u1/a.jpg", { downloadName: "a.jpg" });
    await signedUrl("users/u1/a.jpg", { expiresInSec: 600 });
    await signedUrl("users/u1/b.jpg");
    expect(getSignedUrl).toHaveBeenCalledTimes(4);

    vi.setSystemTime(new Date("2026-03-01T11:00:00Z"));
    expect(await signedUrl("users/u1/a.jpg")).not.toBe(a);
    expect(getSignedUrl).toHaveBeenCalledTimes(5);

    // A new provider instance starts with an empty cache.
    setStorageForTesting({ ...fake } as StorageProvider);
    await signedUrl("users/u1/a.jpg");
    expect(getSignedUrl).toHaveBeenCalledTimes(6);
  });

  it("does not cache failures", async () => {
    let fail = true;
    const getSignedUrl = vi.fn(async (key: string) => {
      if (fail) throw new Error("boom");
      return `https://cdn.test/${key}`;
    });
    setStorageForTesting({ name: "s3", publiclyReachable: true, getSignedUrl } as unknown as StorageProvider);
    await expect(signedUrl("users/u1/a.jpg")).rejects.toThrow("boom");
    fail = false;
    expect(await signedUrl("users/u1/a.jpg")).toBe("https://cdn.test/users/u1/a.jpg");
  });
});
