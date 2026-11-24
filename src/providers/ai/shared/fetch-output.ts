/**
 * Download a provider output URL with a timeout and a size cap (shared by AI adapters).
 * Only https URLs on public hosts are fetched, redirects included (followed manually, each hop
 * re-checked); the body is streamed so an oversized file is aborted early.
 */
import { isIP } from "node:net";

export const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
export const OUTPUT_FETCH_TIMEOUT_MS = 120_000;
export const MAX_OUTPUT_REDIRECTS = 3;

function isPrivateIPv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

/**
 * Throws unless `url` is https and its host is not an internal name or a private/loopback/link-local
 * IP literal. (Hostnames are not resolved: provider CDNs are public names, and a compromised provider
 * is the only way to get an arbitrary URL here.)
 */
export function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== "https:") throw new Error("Output URL must use https.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const kind = isIP(host);
  if (kind === 4 ? isPrivateIPv4(host) : kind === 6 ? isPrivateIPv6(host) : /(^|\.)(localhost|local|internal)$/.test(host)) {
    throw new Error("Output URL must point to a public host.");
  }
}

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
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new Error("Output URL is not a valid URL.");
  }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? OUTPUT_FETCH_TIMEOUT_MS);

  let res: Response;
  for (let hop = 0; ; hop++) {
    assertPublicHttpsUrl(current);
    res = await doFetch(current, { signal, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    await res.body?.cancel().catch(() => undefined);
    if (hop >= MAX_OUTPUT_REDIRECTS) throw new Error("Downloading the output failed: too many redirects.");
    try {
      current = new URL(location, current);
    } catch {
      throw new Error("Downloading the output failed: invalid redirect.");
    }
  }
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
