/**
 * Streaming ZIP downloads. Entries are stored uncompressed (`ZipPassThrough`: JPEG/PNG/WebP/MP4 are
 * already compressed) and read from storage one at a time, so memory stays around one file no
 * matter how many are selected. A file that can't be read is skipped and listed in MISSING.txt.
 */
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { NextRequest } from "next/server";
import { APP } from "@/config/app";
import type { MediaRow } from "@/db/types";
import type { StorageProvider } from "@/providers/types";
import { AppError, BODY_LIMITS, errors, readFormDataLimited, readTextLimited } from "@/server/http";
import { extForMime } from "@/server/media/service";
import { getStorage } from "@/server/storage";
import { MAX_BULK_IDS } from "./dto";
import { mediaIdsRequest } from "./media";

function brandSlug(): string {
  return (
    APP.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "media"
  );
}

/** `openshoot-2026-11-24-med_abc.jpg` */
export function zipEntryName(row: Pick<MediaRow, "id" | "createdAt" | "mimeType">): string {
  return `${brandSlug()}-${row.createdAt.toISOString().slice(0, 10)}-${row.id}.${extForMime(row.mimeType)}`;
}

/** `openshoot-2026-11-24.zip` */
export function zipFileName(now = new Date()): string {
  return `${brandSlug()}-${now.toISOString().slice(0, 10)}.zip`;
}

export interface MediaZipOptions {
  storage?: StorageProvider;
}

/** A web ReadableStream producing a ZIP of the given media (pull-based: storage is read on demand). */
export function createMediaZipStream(
  rows: readonly MediaRow[],
  opts: MediaZipOptions = {},
): ReadableStream<Uint8Array> {
  const storage = opts.storage ?? getStorage();
  const ready: Uint8Array[] = [];
  let complete = false;
  let failure: Error | null = null;
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      failure = err;
      return;
    }
    if (chunk.length) ready.push(chunk);
    if (final) complete = true;
  });

  const missing: string[] = [];
  let next = 0;
  let ended = false;

  const addEntry = (name: string, data: Uint8Array, mtime?: Date) => {
    const file = new ZipPassThrough(name);
    if (mtime) file.mtime = mtime;
    zip.add(file);
    file.push(data, true);
  };

  /** Feed the archive until it has output ready (or is finished). */
  const produce = async () => {
    while (!ready.length && !complete && !failure) {
      if (next < rows.length) {
        const row = rows[next++]!;
        let bytes: Uint8Array | null = null;
        try {
          bytes = await storage.get(row.storageKey);
        } catch (err) {
          console.warn(`[zip] skipping ${row.id}:`, err instanceof Error ? err.message : err);
          missing.push(row.id);
        }
        if (bytes) addEntry(zipEntryName(row), bytes, row.createdAt);
      } else if (!ended) {
        ended = true;
        if (missing.length) {
          addEntry("MISSING.txt", strToU8(`These items could not be read and were skipped:\n${missing.join("\n")}\n`));
        }
        zip.end();
      } else {
        break;
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await produce();
      if (failure) {
        controller.error(failure);
        return;
      }
      while (ready.length) controller.enqueue(ready.shift()!);
      if (complete) controller.close();
    },
    cancel() {
      zip.terminate();
    },
  });
}

/** True when a browser form POST comes from our own origin (hidden-form downloads). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Browsers always send Origin on POST; without one this isn't a cross-site form (cookies are SameSite=Lax).
  if (origin === null) return true;
  try {
    const host = new URL(origin).host;
    return host === req.nextUrl.host || host === new URL(APP.url).host;
  } catch {
    return false;
  }
}

/**
 * Ids from a JSON body (`{ ids: [...] }`, used by fetch → blob) or a form POST (`ids=a,b,c` or repeated
 * `ids` fields, used by the hidden-form download that lets the browser stream large archives to disk).
 */
export async function readDownloadIds(req: NextRequest): Promise<string[]> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    if (!sameOrigin(req)) throw errors.forbidden();
    let form: FormData;
    try {
      form = await readFormDataLimited(req, BODY_LIMITS.json);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw errors.validation("Invalid form body.");
    }
    const ids = form
      .getAll("ids")
      .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = mediaIdsRequest.safeParse({ ids });
    if (!parsed.success) throw errors.validation(`Select between 1 and ${MAX_BULK_IDS} items.`, parsed.error.issues);
    return parsed.data.ids;
  }
  const text = await readTextLimited(req, BODY_LIMITS.json);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw errors.validation("Body must be valid JSON.");
  }
  const parsed = mediaIdsRequest.safeParse(raw);
  if (!parsed.success) throw errors.validation(`Select between 1 and ${MAX_BULK_IDS} items.`, parsed.error.issues);
  return parsed.data.ids;
}
