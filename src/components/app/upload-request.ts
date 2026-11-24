/**
 * Multipart upload via XMLHttpRequest (fetch has no upload progress). Errors are normalized to
 * ApiClientError like `api()` so callers handle both the same way.
 */
import { ApiClientError } from "@/lib/api-client";
import type { ApiErrorBody } from "@/types/domain";

export interface UploadRequestOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function uploadMultipart<T>(url: string, form: FormData, options: UploadRequestOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    for (const [k, v] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(k, v);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        data = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve(data as T);
        return;
      }
      const err = (data as ApiErrorBody | undefined)?.error;
      const fallbackCode = xhr.status === 413 ? "payload_too_large" : "internal";
      reject(
        new ApiClientError(
          err?.code ?? fallbackCode,
          err?.message ?? `Upload failed (${xhr.status})`,
          xhr.status,
          err?.details,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiClientError("network", "Network error — check your connection.", 0));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
