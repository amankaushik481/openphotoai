/**
 * Download a provider output URL with a timeout and a size cap (shared by AI adapters).
 * Only https URLs are fetched; the body is streamed so an oversized file is aborted early.
 */
export const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
export const OUTPUT_FETCH_TIMEOUT_MS = 120_000;

export interface FetchOutputOptions {
  maxBytes?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export async function fetchOutputBytes(
  url: string,
  opts: FetchOutputOptions = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const maxBytes = opts.maxBytes ?? MAX_OUTPUT_BYTES;
  const doFetch = opts.fetch ?? fetch;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Output URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Output URL must use https.");

  const res = await doFetch(parsed, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? OUTPUT_FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Downloading the output failed with HTTP ${res.status}.`);

  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Output is too large (${declared} bytes; limit ${maxBytes}).`);
  }

  const contentType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim();
  if (!res.body) return { bytes: new Uint8Array(0), contentType };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Output is too large (over ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes, contentType };
}
