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
  const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

/** The eight 16-bit groups of an IPv6 literal (a trailing dotted quad included), or null when malformed. */
function ipv6Groups(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0]!;
  const quad = v.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (quad) {
    const [a, b, c, d] = quad.slice(2).map(Number) as [number, number, number, number];
    v = `${quad[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail] : head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => Number.parseInt(g, 16));
}

const ipv4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * Private / internal IPv6, including every spelling that embeds an IPv4 address (WHATWG URL prints
 * `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`, so a dotted-quad pattern alone misses it).
 */
function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(5) && g[5] === 0xffff) return isPrivateIPv4(ipv4Of(g[6]!, g[7]!)); // ::ffff:a.b.c.d (mapped)
  if (zeros(6)) return true; // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] !== 0 || isPrivateIPv4(ipv4Of(g[6]!, g[7]!)); // NAT64
  if (g[0] === 0x2002) return isPrivateIPv4(ipv4Of(g[1]!, g[2]!)); // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo, documentation
  if (g[0] === 0x100 && zeros(4)) return true; // discard-only 100::/64
  return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0 || g[0]! >= 0xff00;
}

/**
 * Throws unless `url` is https and its host is not an internal name or a private/loopback/link-local
 * IP literal. (Hostnames are not resolved: provider CDNs are public names, and a compromised provider
 * is the only way to get an arbitrary URL here.)
 */
export function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== "https:") throw new Error("Output URL must use https.");
  // `localhost.` resolves like `localhost`: drop the root label's dot before matching names.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
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
