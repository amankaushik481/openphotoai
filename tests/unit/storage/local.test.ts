import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStorage, isPublicHttpsUrl, verifyLocalFileSignature, type LocalStorageProvider } from "@/providers/storage/local";
import { assertSafeKey, attachmentDisposition, contentTypeForKey } from "@/providers/storage/keys";
import { env } from "@/lib/env";
import { AppError } from "@/server/http";

const SECRET = "unit-test-secret";
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

let dir: string;
let storage: LocalStorageProvider;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-local-test-"));
  storage = createLocalStorage({ dir: path.join(dir, "root"), baseUrl: "http://localhost:3000/", secret: SECRET });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

function signedParams(url: string) {
  const u = new URL(url);
  const key = u.pathname.replace(/^\/api\/files\//, "").split("/").map(decodeURIComponent).join("/");
  return { u, key, exp: u.searchParams.get("exp")!, sig: u.searchParams.get("sig")!, dl: u.searchParams.get("dl") };
}

describe("local storage: objects", () => {
  it("puts, reads, checks and deletes a file (mkdir -p)", async () => {
    const key = "users/u1/media/m1.jpg";
    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, bytes("hello"), { contentType: "image/jpeg" });
    expect(await storage.exists(key)).toBe(true);
    expect(text(await storage.get(key))).toBe("hello");
    expect(await fs.readFile(path.join(dir, "root", "users/u1/media/m1.jpg"), "utf8")).toBe("hello");

    await storage.put(key, bytes("v2"), { contentType: "image/jpeg" });
    expect(text(await storage.get(key))).toBe("v2");
    // No temp files left behind by the atomic write.
    expect(await fs.readdir(path.join(dir, "root", "users/u1/media"))).toEqual(["m1.jpg"]);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.delete(key)).resolves.toBeUndefined(); // idempotent
  });

  it("throws a not_found AppError for missing files", async () => {
    const err = await storage.get("users/u1/missing.jpg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("not_found");
  });

  it("deletePrefix removes nested files with S3 prefix semantics and returns the count", async () => {
    const put = (k: string) => storage.put(k, bytes(k), { contentType: "application/octet-stream" });
    await put("users/u1/models/m1/photos/p1.jpg");
    await put("users/u1/models/m1/photos/p1_thumb.webp");
    await put("users/u1/models/m1/consent/c1.jpg");
    await put("users/u1/media/a1.jpg");
    await put("users/u1/media/a1_thumb.webp");
    await put("users/u1/media/a2.jpg");
    await put("users/u10/media/x.jpg");
    await put("users/u2/media/y.jpg");

    expect(await storage.deletePrefix("users/u1/media/a1")).toBe(2);
    expect(await storage.exists("users/u1/media/a2.jpg")).toBe(true);

    expect(await storage.deletePrefix("users/u1/models/m1/")).toBe(3);
    expect(await storage.exists("users/u1/models/m1/photos/p1.jpg")).toBe(false);

    expect(await storage.deletePrefix("users/u1/")).toBe(1);
    expect(await storage.exists("users/u10/media/x.jpg")).toBe(true);
    expect(await storage.exists("users/u2/media/y.jpg")).toBe(true);

    expect(await storage.deletePrefix("users/nobody/")).toBe(0);
  });
});

describe("local storage: path safety", () => {
  const badKeys = [
    "../outside.txt",
    "users/../../outside.txt",
    "users/u1/../../../etc/passwd",
    "/etc/passwd",
    "C:/Windows/win.ini",
    "users\\u1\\x.jpg",
    "users/u1/x\u0000.jpg",
    "users//u1.jpg",
    "./users/u1.jpg",
    "users/u1/",
    "",
  ];

  it.each(badKeys)("rejects key %j everywhere", async (key) => {
    await expect(storage.put(key, bytes("x"), { contentType: "text/plain" })).rejects.toThrow(/Invalid storage/);
    await expect(storage.get(key)).rejects.toThrow(/Invalid storage/);
    await expect(storage.exists(key)).rejects.toThrow(/Invalid storage/);
    await expect(storage.delete(key)).rejects.toThrow(/Invalid storage/);
    await expect(storage.getSignedUrl(key)).rejects.toThrow(/Invalid storage/);
    expect(() => storage.resolvePath(key)).toThrow(/Invalid storage/);
  });

  it("never writes outside the root", async () => {
    await storage.put("../escape.txt", bytes("x"), { contentType: "text/plain" }).catch(() => undefined);
    await expect(fs.stat(path.join(dir, "escape.txt"))).rejects.toThrow();
  });

  it.each(["", "/", "../", "users/../", "..", "/users/"])("deletePrefix rejects %j", async (prefix) => {
    await expect(storage.deletePrefix(prefix)).rejects.toThrow(/Invalid storage/);
  });

  it("accepts every key shape produced by storageKeys", async () => {
    const { storageKeys } = await import("@/server/storage");
    const keys = [
      storageKeys.consentSelfie("usr_1", "mdl_1", "c_1"),
      storageKeys.trainingPhoto("usr_1", "mdl_1", "p_1"),
      storageKeys.trainingPhotoThumb("usr_1", "mdl_1", "p_1"),
      storageKeys.trainingZip("usr_1", "mdl_1", "job_1"),
      storageKeys.media("usr_1", "med_1", "mp4"),
      storageKeys.mediaThumb("usr_1", "med_1"),
      storageKeys.upload("usr_1", "upl_1", "png"),
    ];
    for (const k of keys) expect(() => assertSafeKey(k)).not.toThrow();
  });
});

describe("local storage: signed URLs", () => {
  it("builds /api/files URLs that verify with the same secret", async () => {
    const before = Math.floor(Date.now() / 1000);
    const url = await storage.getSignedUrl("users/u1/media/m 1.jpg");
    const { u, key, exp, sig, dl } = signedParams(url);
    expect(u.origin).toBe("http://localhost:3000");
    expect(u.pathname).toBe("/api/files/users/u1/media/m%201.jpg");
    expect(key).toBe("users/u1/media/m 1.jpg");
    expect(Number(exp) - before).toBeGreaterThanOrEqual(3599);
    expect(Number(exp) - before).toBeLessThanOrEqual(3601);
    expect(dl).toBeNull();
    expect(storage.verifySignature(key, exp, sig, dl)).toBe(true);
    expect(verifyLocalFileSignature(key, exp, sig, dl, { secret: SECRET })).toBe(true);
  });

  it("signs the download name", async () => {
    const url = await storage.getSignedUrl("users/u1/media/m1.jpg", { downloadName: "my photo.jpg", expiresInSec: 60 });
    const { key, exp, sig, dl } = signedParams(url);
    expect(dl).toBe("my photo.jpg");
    expect(storage.verifySignature(key, exp, sig, dl)).toBe(true);
    expect(storage.verifySignature(key, exp, sig, null)).toBe(false);
    expect(storage.verifySignature(key, exp, sig, "other.jpg")).toBe(false);
  });

  it("rejects tampered keys, expiries, signatures and foreign secrets", async () => {
    const { key, exp, sig, dl } = signedParams(await storage.getSignedUrl("users/u1/media/m1.jpg"));
    expect(storage.verifySignature("users/u2/media/m1.jpg", exp, sig, dl)).toBe(false);
    expect(storage.verifySignature(key, String(Number(exp) + 1000), sig, dl)).toBe(false);
    expect(storage.verifySignature(key, exp, sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA"), dl)).toBe(false);
    expect(storage.verifySignature(key, exp, "", dl)).toBe(false);
    expect(storage.verifySignature(key, "not-a-number", sig, dl)).toBe(false);
    expect(verifyLocalFileSignature(key, exp, sig, dl, { secret: "another-secret" })).toBe(false);
  });

  it("expires", async () => {
    const { key, exp, sig } = signedParams(await storage.getSignedUrl("users/u1/media/m1.jpg", { expiresInSec: 10 }));
    expect(verifyLocalFileSignature(key, exp, sig, null, { secret: SECRET, nowSec: Number(exp) })).toBe(true);
    expect(verifyLocalFileSignature(key, exp, sig, null, { secret: SECRET, nowSec: Number(exp) + 1 })).toBe(false);

    vi.spyOn(Date, "now").mockReturnValue((Number(exp) + 5) * 1000);
    expect(storage.verifySignature(key, exp, sig, null)).toBe(false);
  });

  it("defaults the standalone verifier to the app secret", async () => {
    const appStorage = createLocalStorage({ dir: path.join(dir, "app"), baseUrl: "http://localhost:3000", secret: env.authSecret });
    const { key, exp, sig } = signedParams(await appStorage.getSignedUrl("users/u1/a.jpg"));
    expect(verifyLocalFileSignature(key, exp, sig, null)).toBe(true);
  });

  it("clamps the TTL to 7 days", async () => {
    const { exp } = signedParams(await storage.getSignedUrl("users/u1/a.jpg", { expiresInSec: 365 * 24 * 3600 }));
    expect(Number(exp) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(7 * 24 * 3600);
  });
});

describe("local storage: reachability + helpers", () => {
  it.each([
    ["http://localhost:3000", false],
    ["https://localhost:3000", false],
    ["https://app.localhost", false],
    ["https://127.0.0.1", false],
    ["https://192.168.1.20", false],
    ["https://10.0.0.5", false],
    ["https://[::1]:3000", false],
    ["http://photos.example.com", false],
    ["https://photos.example.com", true],
    ["not a url", false],
  ])("publiclyReachable(%s) = %s", (baseUrl, expected) => {
    expect(isPublicHttpsUrl(baseUrl)).toBe(expected);
    expect(createLocalStorage({ dir, baseUrl, secret: SECRET }).publiclyReachable).toBe(expected);
  });

  it("maps extensions to content types", () => {
    expect(contentTypeForKey("a/b.JPG")).toBe("image/jpeg");
    expect(contentTypeForKey("a/b.webp")).toBe("image/webp");
    expect(contentTypeForKey("a/b.mp4")).toBe("video/mp4");
    expect(contentTypeForKey("a/b.zip")).toBe("application/zip");
    expect(contentTypeForKey("a/b")).toBe("application/octet-stream");
  });

  it("builds safe attachment dispositions", () => {
    expect(attachmentDisposition("photo.jpg")).toBe(`attachment; filename="photo.jpg"; filename*=UTF-8''photo.jpg`);
    const tricky = attachmentDisposition('a"b;\r\nc/é.jpg');
    expect(tricky).not.toMatch(/[\r\n]/);
    expect(tricky).toContain(`filename="a_b_c_.jpg"`);
    expect(tricky).toContain("filename*=UTF-8''a%22b%3Bc%C3%A9.jpg");
  });
});
