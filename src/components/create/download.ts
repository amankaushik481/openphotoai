/**
 * "Download all" via POST /api/media/download (zip stream). Where the File System Access API exists
 * (Chromium) the response is streamed straight to disk; elsewhere it is buffered into a Blob and
 * saved through a temporary link.
 */
import { filenameFromDisposition } from "@/components/create/logic";
import { ApiClientError } from "@/lib/api-client";
import type { ApiErrorBody } from "@/types/domain";

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
type ShowSaveFilePicker = (opts: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

function savePicker(): ShowSaveFilePicker | null {
  const fn = (window as Window & { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  return typeof fn === "function" ? fn.bind(window) : null;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function requestZip(ids: readonly string[]): Promise<Response> {
  let res: Response;
  try {
    res = await fetch("/api/media/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch {
    throw new ApiClientError("network", "Network error — check your connection.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new ApiClientError(
      body?.error.code ?? "internal",
      body?.error.message ?? `Download failed (${res.status})`,
      res.status,
      body?.error.details,
    );
  }
  return res;
}

/**
 * Download media as one zip. Resolves `false` when the user dismissed the save dialog.
 * Must be called from a click handler (the save dialog needs the user gesture).
 */
export async function downloadMediaZip(ids: readonly string[], fallbackName: string): Promise<boolean> {
  if (ids.length === 0) return false;
  const picker = savePicker();

  if (picker) {
    let handle: FileSystemFileHandle;
    try {
      // Ask for the destination first, while we still hold the click's user activation.
      handle = await picker({
        suggestedName: fallbackName,
        types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
      });
    } catch (err) {
      if (isAbortError(err)) return false;
      return downloadViaBlob(ids, fallbackName); // e.g. SecurityError in an iframe
    }
    const res = await requestZip(ids);
    const writable = await handle.createWritable();
    if (res.body) {
      await res.body.pipeTo(writable);
    } else {
      await writable.write(await res.blob());
      await writable.close();
    }
    return true;
  }
  return downloadViaBlob(ids, fallbackName);
}

async function downloadViaBlob(ids: readonly string[], fallbackName: string): Promise<boolean> {
  const res = await requestZip(ids);
  const name = filenameFromDisposition(res.headers.get("content-disposition"), fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
