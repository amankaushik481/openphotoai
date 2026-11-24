import type Replicate from "replicate";

export type ReplicateClient = Replicate;

/** Lazily constructs one authenticated client (the SDK is only imported on first use). */
export function lazyReplicateClient(apiToken: string): () => Promise<ReplicateClient> {
  let client: Promise<ReplicateClient> | undefined;
  return () => {
    client ??= import("replicate")
      .then((mod) => {
        const Ctor = mod.default;
        return new Ctor({ auth: apiToken, useFileOutput: false, userAgent: "openshoot/1.0" });
      })
      .catch((err: unknown) => {
        client = undefined;
        throw err;
      });
    return client;
  };
}

/** HTTP status of a Replicate SDK `ApiError`, if the error is one. */
export function apiErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("response" in err)) return undefined;
  const res = (err as { response?: unknown }).response;
  if (typeof res !== "object" || res === null || !("status" in res)) return undefined;
  const status = (res as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}
