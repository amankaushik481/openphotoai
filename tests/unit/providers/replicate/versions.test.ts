import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReplicateProvider } from "@/providers/ai/replicate";
import { createVersionResolver, VERSION_CACHE_TTL_MS } from "@/providers/ai/replicate/versions";
import type { ReplicateClient } from "@/providers/ai/replicate/client";
import { fake, resetFake } from "./fake-replicate";

vi.mock("replicate", async () => (await import("./fake-replicate")).replicateModule);

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const faceRestore = (p: ReturnType<typeof createReplicateProvider>) => p.submitFaceRestore({ imageUrl: "https://cdn.example.com/a.jpg" });

describe("latest version resolution", () => {
  it("resolves community 'latest' versions once and caches them for an hour", async () => {
    fake.models.get.mockResolvedValueOnce({ latest_version: { id: "v1" } }).mockResolvedValueOnce({ latest_version: { id: "v2" } });
    const p = createReplicateProvider({ apiToken: "t", owner: "acme" });

    await faceRestore(p);
    vi.setSystemTime(new Date("2026-11-24T10:59:00Z"));
    await faceRestore(p);
    expect(fake.models.get).toHaveBeenCalledTimes(1);
    expect(fake.predictions.create.mock.calls.map((c) => (c[0] as { version: string }).version)).toEqual(["v1", "v1"]);

    vi.setSystemTime(new Date(Date.now() + 2 * 60_000)); // past the 1 h TTL
    await faceRestore(p);
    expect(fake.models.get).toHaveBeenCalledTimes(2);
    expect((fake.predictions.create.mock.calls[2][0] as { version: string }).version).toBe("v2");
  });

  it("shares one lookup between concurrent requests and does not cache failures", async () => {
    let resolve!: (v: unknown) => void;
    fake.models.get.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const p = createReplicateProvider({ apiToken: "t", owner: "acme" });
    const both = Promise.all([faceRestore(p), faceRestore(p)]);
    await vi.waitFor(() => expect(fake.models.get).toHaveBeenCalledTimes(1));
    resolve({ latest_version: { id: "v1" } });
    await both;
    expect(fake.models.get).toHaveBeenCalledTimes(1);

    const client = { models: { get: vi.fn() } } as unknown as ReplicateClient;
    const getMock = (client.models.get as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ latest_version: { id: "v9" } });
    const resolver = createVersionResolver(async () => client, VERSION_CACHE_TTL_MS);
    await expect(resolver.latestVersion("sczhou/codeformer")).rejects.toThrow("network");
    await expect(resolver.latestVersion("sczhou/codeformer")).resolves.toBe("v9");
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("errors when a model has no published version", async () => {
    fake.models.get.mockResolvedValue({ latest_version: null });
    await expect(faceRestore(createReplicateProvider({ apiToken: "t", owner: "acme" }))).rejects.toThrow(/no published version/);
    expect(fake.predictions.create).not.toHaveBeenCalled();
  });

  it("targets official models by name and pinned versions directly", async () => {
    const client = { models: { get: vi.fn() } } as unknown as ReplicateClient;
    const resolver = createVersionResolver(async () => client);
    expect(await resolver.target({ id: "google/nano-banana-2" })).toEqual({ model: "google/nano-banana-2" });
    expect(await resolver.target({ id: "men1scus/birefnet", version: "abc" })).toEqual({ version: "abc" });
    expect(client.models.get).not.toHaveBeenCalled();
  });
});
