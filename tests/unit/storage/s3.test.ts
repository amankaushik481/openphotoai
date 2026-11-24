import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

type Input = Record<string, unknown>;
interface SentCommand {
  name: string;
  input: Input;
}

const fake = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  sent: [] as { name: string; input: Record<string, unknown> }[],
  respond: (() => ({})) as (cmd: { name: string; input: Record<string, unknown> }) => unknown,
  presign: [] as { command: { name: string; input: Record<string, unknown> }; options: unknown }[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    readonly name: string;
    constructor(
      name: string,
      readonly input: Record<string, unknown>,
    ) {
      this.name = name;
    }
  }
  const command = (name: string) =>
    class extends Command {
      constructor(input: Record<string, unknown>) {
        super(name, input);
      }
    };
  class S3Client {
    constructor(config: unknown) {
      fake.clientConfigs.push(config);
    }
    async send(cmd: Command) {
      fake.sent.push({ name: cmd.name, input: cmd.input });
      const out = fake.respond(cmd);
      if (out instanceof Error) throw out;
      return out;
    }
  }
  return {
    S3Client,
    PutObjectCommand: command("PutObject"),
    GetObjectCommand: command("GetObject"),
    HeadObjectCommand: command("HeadObject"),
    DeleteObjectCommand: command("DeleteObject"),
    DeleteObjectsCommand: command("DeleteObjects"),
    ListObjectsV2Command: command("ListObjectsV2"),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client: unknown, command: SentCommand, options: { expiresIn: number }) => {
    fake.presign.push({ command, options });
    return `https://bucket.example.com/${String(command.input.Key)}?X-Amz-Expires=${options.expiresIn}`;
  },
}));

const { createS3Storage } = await import("@/providers/storage/s3");

const OPTS = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "openshoot",
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret",
  forcePathStyle: true,
};

function s3Error(name: string, status: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
}

beforeEach(() => {
  fake.clientConfigs.length = 0;
  fake.sent.length = 0;
  fake.presign.length = 0;
  fake.respond = () => ({});
});

describe("createS3Storage", () => {
  it("is cheap: the SDK client is created lazily, once", async () => {
    const storage = createS3Storage(OPTS);
    expect(storage.name).toBe("s3");
    expect(storage.publiclyReachable).toBe(true);
    expect(fake.clientConfigs).toHaveLength(0);

    await storage.delete("users/u1/a.jpg");
    await storage.delete("users/u1/b.jpg");
    expect(fake.clientConfigs).toHaveLength(1);
    expect(fake.clientConfigs[0]).toMatchObject({
      region: "auto",
      endpoint: OPTS.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: "AKIA_TEST", secretAccessKey: "secret" },
    });
  });

  it("puts objects with content type + cache control", async () => {
    const body = new Uint8Array([1, 2, 3]);
    await createS3Storage(OPTS).put("users/u1/media/m1.jpg", body, { contentType: "image/jpeg", cacheControl: "max-age=60" });
    expect(fake.sent).toEqual([
      {
        name: "PutObject",
        input: { Bucket: "openshoot", Key: "users/u1/media/m1.jpg", Body: body, ContentType: "image/jpeg", CacheControl: "max-age=60" },
      },
    ]);
  });

  it("gets bytes and maps NoSuchKey to not_found", async () => {
    const storage = createS3Storage(OPTS);
    fake.respond = () => ({ Body: { transformToByteArray: async () => new Uint8Array([9, 8]) } });
    expect(await storage.get("users/u1/a.jpg")).toEqual(new Uint8Array([9, 8]));
    expect(fake.sent[0]).toEqual({ name: "GetObject", input: { Bucket: "openshoot", Key: "users/u1/a.jpg" } });

    fake.respond = () => s3Error("NoSuchKey", 404);
    const err = await storage.get("users/u1/missing.jpg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("not_found");

    fake.respond = () => s3Error("AccessDenied", 403);
    await expect(storage.get("users/u1/a.jpg")).rejects.toThrow("AccessDenied");
  });

  it("exists() uses HeadObject and treats 404 as false", async () => {
    const storage = createS3Storage(OPTS);
    expect(await storage.exists("users/u1/a.jpg")).toBe(true);
    fake.respond = () => s3Error("NotFound", 404);
    expect(await storage.exists("users/u1/a.jpg")).toBe(false);
    fake.respond = () => s3Error("InternalError", 500);
    await expect(storage.exists("users/u1/a.jpg")).rejects.toThrow("InternalError");
    expect(fake.sent.every((c) => c.name === "HeadObject")).toBe(true);
  });

  it("deletePrefix pages through ListObjectsV2 and deletes in batches of 1000", async () => {
    const keys = Array.from({ length: 2500 }, (_, i) => `users/u1/media/${i}.jpg`);
    fake.respond = (cmd) => {
      if (cmd.name === "ListObjectsV2") {
        const start = cmd.input.ContinuationToken ? Number(cmd.input.ContinuationToken) : 0;
        const page = keys.slice(start, start + 1000);
        const next = start + page.length;
        return { Contents: page.map((Key) => ({ Key })), IsTruncated: next < keys.length, NextContinuationToken: String(next) };
      }
      return { Deleted: [] };
    };
    expect(await createS3Storage(OPTS).deletePrefix("users/u1/")).toBe(2500);

    const lists = fake.sent.filter((c) => c.name === "ListObjectsV2");
    expect(lists).toHaveLength(3);
    expect(lists[0]!.input).toMatchObject({ Bucket: "openshoot", Prefix: "users/u1/", MaxKeys: 1000 });
    const deletes = fake.sent.filter((c) => c.name === "DeleteObjects");
    const sizes = deletes.map((d) => (d.input.Delete as { Objects: unknown[] }).Objects.length);
    expect(sizes).toEqual([1000, 1000, 500]);
    expect((deletes[0]!.input.Delete as { Objects: { Key: string }[]; Quiet: boolean }).Objects[0]).toEqual({ Key: keys[0] });
  });

  it("deletePrefix surfaces per-object errors and refuses unsafe prefixes", async () => {
    fake.respond = (cmd) =>
      cmd.name === "ListObjectsV2"
        ? { Contents: [{ Key: "users/u1/a.jpg" }], IsTruncated: false }
        : { Errors: [{ Key: "users/u1/a.jpg", Code: "AccessDenied" }] };
    await expect(createS3Storage(OPTS).deletePrefix("users/u1/")).rejects.toThrow(/AccessDenied/);
    await expect(createS3Storage(OPTS).deletePrefix("")).rejects.toThrow(/Invalid storage/);
    await expect(createS3Storage(OPTS).deletePrefix("../")).rejects.toThrow(/Invalid storage/);
  });

  it("presigns GET URLs with expiry and an optional attachment disposition", async () => {
    const storage = createS3Storage(OPTS);
    const url = await storage.getSignedUrl("users/u1/media/m1.jpg");
    // Signed at the start of the hour, valid for one window + the 1h TTL.
    expect(url).toBe("https://bucket.example.com/users/u1/media/m1.jpg?X-Amz-Expires=7200");
    expect(fake.presign[0]!.command.input).toEqual({
      Bucket: "openshoot",
      Key: "users/u1/media/m1.jpg",
      ResponseCacheControl: "private, max-age=3600, immutable",
    });

    await storage.getSignedUrl("users/u1/media/m1.jpg", { downloadName: "photo.jpg", expiresInSec: 120 });
    expect(fake.presign[1]!.options).toMatchObject({ expiresIn: 240 });
    expect(fake.presign[1]!.command.input.ResponseContentDisposition).toBe(
      `attachment; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
    );

    await storage.getSignedUrl("users/u1/media/m1.jpg", { expiresInSec: 30 * 24 * 3600 });
    expect(fake.presign[2]!.options).toMatchObject({ expiresIn: 7 * 24 * 3600 });
  });

  it("signs against a time bucket so URLs are stable (cacheable) within the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const storage = createS3Storage(OPTS);
      vi.setSystemTime(new Date("2026-01-01T10:05:00Z"));
      await storage.getSignedUrl("users/u1/media/m1.jpg");
      vi.setSystemTime(new Date("2026-01-01T10:59:59Z"));
      await storage.getSignedUrl("users/u1/media/m1.jpg");
      vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
      await storage.getSignedUrl("users/u1/media/m1.jpg");
      const dates = fake.presign.map((p) => (p.options as { signingDate: Date }).signingDate.toISOString());
      expect(dates).toEqual(["2026-01-01T10:00:00.000Z", "2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores objects as immutable unless the caller sets Cache-Control", async () => {
    await createS3Storage(OPTS).put("users/u1/media/m2.jpg", new Uint8Array([1]), { contentType: "image/jpeg" });
    expect(fake.sent[0]!.input.CacheControl).toBe("private, max-age=31536000, immutable");
  });

  it("validates keys before calling S3", async () => {
    const storage = createS3Storage(OPTS);
    await expect(storage.put("../x", new Uint8Array(), { contentType: "image/jpeg" })).rejects.toThrow(/Invalid storage/);
    await expect(storage.getSignedUrl("/abs.jpg")).rejects.toThrow(/Invalid storage/);
    expect(fake.sent).toHaveLength(0);
  });
});
