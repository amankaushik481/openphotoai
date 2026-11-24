import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/api/files/[...key]/route";
import { createLocalStorage } from "@/providers/storage/local";
import { createS3Storage } from "@/providers/storage/s3";
import { setStorageForTesting } from "@/server/storage";
import { parseRange } from "@/server/storage/serve";

const JPEG = Uint8Array.from({ length: 100 }, (_, i) => i);
const VIDEO = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);

let dir: string;
const storage = () => createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "route-test-secret" });

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-files-route-"));
  const s = storage();
  await s.put("users/u1/media/m1.jpg", JPEG, { contentType: "image/jpeg" });
  await s.put("users/u1/media/v1.mp4", VIDEO, { contentType: "video/mp4" });
  setStorageForTesting(s);
});

afterEach(() => {
  vi.restoreAllMocks();
  setStorageForTesting(storage());
});

afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(dir, { recursive: true, force: true });
});

function call(url: string, init?: { headers?: Record<string, string>; method?: "GET" | "HEAD" }) {
  const u = new URL(url);
  const key = u.pathname.replace(/^\/api\/files\//, "").split("/").map(decodeURIComponent);
  const req = new NextRequest(url, { headers: init?.headers, method: init?.method ?? "GET" });
  const ctx = { params: Promise.resolve({ key }) };
  return init?.method === "HEAD" ? HEAD(req, ctx) : GET(req, ctx);
}

const signed = (key: string, opts?: { expiresInSec?: number; downloadName?: string }) => storage().getSignedUrl(key, opts);

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe("GET /api/files/[...key]", () => {
  it("serves a validly signed file with type + caching headers", async () => {
    const res = await call(await signed("users/u1/media/m1.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it("sets an attachment disposition when dl is present", async () => {
    const res = await call(await signed("users/u1/media/m1.jpg", { downloadName: "headshot 1.jpg" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="headshot 1.jpg"; filename*=UTF-8''headshot%201.jpg`);
  });

  it("returns 403 for expired links", async () => {
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow - 2 * 3600 * 1000);
    const url = await signed("users/u1/media/m1.jpg");
    vi.restoreAllMocks();
    const res = await call(url);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("forbidden");
  });

  it("returns 403 for tampered or missing signatures", async () => {
    const url = new URL(await signed("users/u1/media/m1.jpg"));

    const otherKey = new URL(url);
    otherKey.pathname = "/api/files/users/u1/media/v1.mp4";
    expect((await call(otherKey.toString())).status).toBe(403);

    const longer = new URL(url);
    longer.searchParams.set("exp", String(Number(url.searchParams.get("exp")) + 3600));
    expect((await call(longer.toString())).status).toBe(403);

    const withDl = new URL(url);
    withDl.searchParams.set("dl", "x.jpg");
    expect((await call(withDl.toString())).status).toBe(403);

    const noSig = new URL(url);
    noSig.searchParams.delete("sig");
    expect((await call(noSig.toString())).status).toBe(403);

    const otherSecret = createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "attacker" });
    expect((await call(await otherSecret.getSignedUrl("users/u1/media/m1.jpg"))).status).toBe(403);
  });

  it("returns 404 for a validly signed missing file", async () => {
    const res = await call(await signed("users/u1/media/nope.jpg"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the S3 driver is configured", async () => {
    const url = await signed("users/u1/media/m1.jpg");
    setStorageForTesting(
      createS3Storage({ region: "auto", bucket: "b", accessKeyId: "k", secretAccessKey: "s", forcePathStyle: false }),
    );
    const res = await call(url);
    expect(res.status).toBe(404);
  });

  it("supports byte ranges for video playback", async () => {
    const url = await signed("users/u1/media/v1.mp4");

    const first = await call(url, { headers: { range: "bytes=0-99" } });
    expect(first.status).toBe(206);
    expect(first.headers.get("content-type")).toBe("video/mp4");
    expect(first.headers.get("content-range")).toBe("bytes 0-99/5000");
    expect(first.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(VIDEO.subarray(0, 100));

    const open = await call(url, { headers: { range: "bytes=4990-" } });
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 4990-4999/5000");
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(VIDEO.subarray(4990));

    const suffix = await call(url, { headers: { range: "bytes=-10" } });
    expect(suffix.status).toBe(206);
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(VIDEO.subarray(4990));

    const bad = await call(url, { headers: { range: "bytes=6000-" } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe("bytes */5000");
  });

  it("answers HEAD without a body", async () => {
    const res = await call(await signed("users/u1/media/v1.mp4"), { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("5000");
    expect(res.body).toBeNull();
  });
});

describe("parseRange", () => {
  it.each([
    [null, 100, null],
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-200", 100, { start: 90, end: 99 }],
    ["bytes=50-", 100, { start: 50, end: 99 }],
    ["bytes=-30", 100, { start: 70, end: 99 }],
    ["bytes=-300", 100, { start: 0, end: 99 }],
    ["bytes=100-", 100, "unsatisfiable"],
    ["bytes=10-5", 100, "unsatisfiable"],
    ["bytes=-0", 100, "unsatisfiable"],
    ["bytes=0-", 0, "unsatisfiable"],
    ["bytes=0-1,5-6", 100, null],
    ["items=0-1", 100, null],
  ] as const)("%s (size %d)", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });
});
