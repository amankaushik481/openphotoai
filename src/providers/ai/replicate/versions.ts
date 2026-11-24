import type { ModelSpec } from "@/config/models";
import type { ReplicateClient } from "./client";
import { splitModelId } from "./refs";

export const VERSION_CACHE_TTL_MS = 60 * 60 * 1000;

/** How to address a model in `predictions.create`: official models by name, community models by version. */
export type ModelTarget = { model: string } | { version: string };

/**
 * Resolves `version: "latest"` specs through `models.get(owner, name)` and caches the answer in memory
 * for an hour (concurrent lookups share one request; failures are not cached).
 */
export function createVersionResolver(getClient: () => Promise<ReplicateClient>, ttlMs = VERSION_CACHE_TTL_MS) {
  const cache = new Map<string, { version: Promise<string>; at: number }>();

  async function latestVersion(modelId: string): Promise<string> {
    const hit = cache.get(modelId);
    if (hit && Date.now() - hit.at < ttlMs) return hit.version;

    const version = (async () => {
      const { owner, name } = splitModelId(modelId);
      const client = await getClient();
      const model = await client.models.get(owner, name);
      const id = model.latest_version?.id;
      if (!id) throw new Error(`Replicate model ${modelId} has no published version`);
      return id;
    })();
    cache.set(modelId, { version, at: Date.now() });
    version.catch(() => {
      if (cache.get(modelId)?.version === version) cache.delete(modelId);
    });
    return version;
  }

  async function versionOf(spec: Pick<ModelSpec, "id" | "version">): Promise<string | undefined> {
    if (!spec.version) return undefined;
    return spec.version === "latest" ? latestVersion(spec.id) : spec.version;
  }

  async function target(spec: Pick<ModelSpec, "id" | "version">): Promise<ModelTarget> {
    const version = await versionOf(spec);
    return version ? { version } : { model: spec.id };
  }

  return { latestVersion, versionOf, target, clear: () => cache.clear() };
}

export type VersionResolver = ReturnType<typeof createVersionResolver>;
