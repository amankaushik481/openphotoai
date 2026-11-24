/**
 * In-process LRU for bytes handed to the mock provider via uploadInput(). Good enough for a
 * mock: inputs are only read back at submit time, in the same process that uploaded them.
 */
import { createHash } from "node:crypto";

const MAX_ENTRIES = 200;
const MAX_BYTES = 256 * 1024 * 1024;

interface Entry {
  bytes: Uint8Array;
  contentType: string;
}

const entries = new Map<string, Entry>();
let totalBytes = 0;

/** Store bytes and return their `mock://input/<sha256>` URL. */
export function putMockInput(bytes: Uint8Array, contentType: string): string {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const existing = entries.get(sha);
  if (existing) {
    entries.delete(sha);
    entries.set(sha, existing);
  } else {
    entries.set(sha, { bytes: new Uint8Array(bytes), contentType });
    totalBytes += bytes.byteLength;
    while (entries.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      totalBytes -= entries.get(oldest)?.bytes.byteLength ?? 0;
      entries.delete(oldest);
    }
  }
  return `mock://input/${sha}`;
}

export function getMockInput(sha: string): Entry | undefined {
  return entries.get(sha);
}
