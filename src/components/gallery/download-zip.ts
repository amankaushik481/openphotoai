/**
 * Client-side ZIP download. Small selections use fetch → blob (errors can be shown); large ones
 * submit a hidden form into a hidden iframe so the browser streams the archive straight to disk.
 */
import { ApiClientError } from "@/lib/api-client";
import { ZIP_FETCH_MAX_ITEMS } from "@/server/gallery/dto";
import type { ApiErrorBody } from "@/types/domain";

const DOWNLOAD_URL = "/api/media/download";
const FRAME_NAME = "gallery-zip-download";

/** `attachment; filename="a.zip"` → `a.zip` (null when absent). */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function fetchZip(ids: readonly string[]): Promise<void> {
  let res: Response;
  try {
    res = await fetch(DOWNLOAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch {
    throw new ApiClientError("network", "Network error — check your connection.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new ApiClientError(body?.error.code ?? "internal", body?.error.message ?? "Download failed.", res.status);
  }
  const blob = await res.blob();
  saveBlob(blob, filenameFromDisposition(res.headers.get("content-disposition")) ?? "photos.zip");
}

function streamZip(ids: readonly string[]) {
  let frame = document.querySelector<HTMLIFrameElement>(`iframe[name="${FRAME_NAME}"]`);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = FRAME_NAME;
    frame.title = "Download";
    frame.hidden = true;
    frame.tabIndex = -1;
    document.body.append(frame);
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = DOWNLOAD_URL;
  form.target = FRAME_NAME;
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "ids";
  input.value = ids.join(",");
  form.append(input);
  document.body.append(form);
  form.submit();
  form.remove();
}

/** Download the given media as one ZIP. Resolves when the download has started (or finished for small ones). */
export async function downloadMediaZip(ids: readonly string[]): Promise<"saved" | "streaming"> {
  if (ids.length <= ZIP_FETCH_MAX_ITEMS) {
    await fetchZip(ids);
    return "saved";
  }
  streamZip(ids);
  return "streaming";
}
