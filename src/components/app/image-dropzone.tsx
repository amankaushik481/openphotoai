"use client";

import * as React from "react";
import { CheckIcon, ImagePlusIcon, LoaderCircleIcon, RotateCwIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ImageDecodeError, prepareImageForUpload, type OutputType } from "@/components/app/image-resize";
import { uploadMultipart } from "@/components/app/upload-request";
import { UPLOAD_LIMITS } from "@/config/app";
import { ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export type UploadStatus = "queued" | "preparing" | "uploading" | "done" | "error";

export interface UploadItem<T = unknown> {
  id: string;
  name: string;
  previewUrl: string | null;
  status: UploadStatus;
  /** 0–100 */
  progress: number;
  error?: string;
  result?: T;
}

export interface ImageDropzoneProps<T = unknown> {
  /** POST target, e.g. "/api/uploads" or `/api/models/${id}/photos`. */
  endpoint: string;
  /** Multipart field name for the file. */
  fieldName?: string;
  /** Extra multipart fields sent with every file, e.g. `{ purpose: "reference" }`. */
  extraFields?: Record<string, string>;
  headers?: Record<string, string>;
  multiple?: boolean;
  /** Max files accepted in this dropzone's lifetime list (errors don't count). */
  maxFiles?: number;
  /** Longest side after client-side resize (default 2048). */
  maxSide?: number;
  /** Encoder quality 0–1 (default 0.9). */
  quality?: number;
  outputType?: OutputType;
  /** Parallel uploads (default 3). */
  concurrency?: number;
  disabled?: boolean;
  /**
   * Accept images pasted anywhere on the page (default true). If a page renders several
   * dropzones, enable it on one only.
   */
  enablePaste?: boolean;
  /** Drop successful items from the list (when the parent renders results itself). */
  removeOnSuccess?: boolean;
  hideList?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
  onUploaded?: (result: T, file: File) => void;
  onError?: (error: ApiClientError | Error, file: File) => void;
  /** Fires when the queue drains (all items done or failed). */
  onIdle?: (items: UploadItem<T>[]) => void;
}

let seq = 0;
const nextId = () => `up_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function isAccepted(file: File): boolean {
  if ((UPLOAD_LIMITS.acceptedMime as readonly string[]).includes(file.type)) return true;
  // Some platforms report HEIC with an empty type.
  return file.type === "" && /\.(heic|heif)$/i.test(file.name);
}

export function ImageDropzone<T = unknown>({
  endpoint,
  fieldName = "file",
  extraFields,
  headers,
  multiple = true,
  maxFiles,
  maxSide = UPLOAD_LIMITS.clientMaxSide,
  quality = 0.9,
  outputType = "image/jpeg",
  concurrency = 3,
  disabled = false,
  enablePaste = true,
  removeOnSuccess = false,
  hideList = false,
  title,
  hint,
  compact = false,
  className,
  onUploaded,
  onError,
  onIdle,
}: ImageDropzoneProps<T>) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const [items, setItems] = React.useState<UploadItem<T>[]>([]);
  const [dragDepth, setDragDepth] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const files = React.useRef(new Map<string, File>());
  const queue = React.useRef<string[]>([]);
  const active = React.useRef(0);
  const itemsRef = React.useRef(items);
  const latest = React.useRef({ endpoint, fieldName, extraFields, headers, maxSide, quality, outputType, onUploaded, onError, onIdle, removeOnSuccess });

  React.useEffect(() => {
    itemsRef.current = items;
    latest.current = { endpoint, fieldName, extraFields, headers, maxSide, quality, outputType, onUploaded, onError, onIdle, removeOnSuccess };
  });

  // Revoke preview URLs on unmount.
  React.useEffect(
    () => () => {
      for (const item of itemsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const patch = React.useCallback((id: string, update: Partial<UploadItem<T>>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...update } : it)));
  }, []);

  const processOne = React.useCallback(
    async (id: string) => {
      const original = files.current.get(id);
      if (!original) return;
      const cfg = latest.current;
      try {
        patch(id, { status: "preparing", progress: 0, error: undefined });
        const prepared = await prepareImageForUpload(original, {
          maxSide: cfg.maxSide,
          quality: cfg.quality,
          type: cfg.outputType,
        });
        if (prepared.file.size > UPLOAD_LIMITS.maxBytes) throw new ApiClientError("payload_too_large", t("upload.tooLarge"), 413);

        const form = new FormData();
        form.append(cfg.fieldName, prepared.file, prepared.file.name);
        for (const [k, v] of Object.entries(cfg.extraFields ?? {})) form.append(k, v);

        patch(id, { status: "uploading", progress: 1 });
        const result = await uploadMultipart<T>(cfg.endpoint, form, {
          headers: cfg.headers,
          onProgress: (f) => patch(id, { progress: Math.max(1, Math.round(f * 100)) }),
        });
        patch(id, { status: "done", progress: 100, result });
        setAnnouncement(`${original.name}: ${t("upload.uploaded")}`);
        cfg.onUploaded?.(result, original);
        if (cfg.removeOnSuccess) {
          setItems((prev) => {
            const gone = prev.find((it) => it.id === id);
            if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
            return prev.filter((it) => it.id !== id);
          });
          files.current.delete(id);
        }
      } catch (err) {
        const message =
          err instanceof ImageDecodeError
            ? t("upload.unreadable")
            : err instanceof ApiClientError
              ? err.message || errorMessage(err.code)
              : t("upload.failed");
        patch(id, { status: "error", error: message });
        setAnnouncement(`${original.name}: ${message}`);
        cfg.onError?.(err instanceof Error ? err : new Error(String(err)), original);
      }
    },
    [patch, t],
  );

  /** Start workers (up to `concurrency`); each drains the shared queue. */
  const pump = React.useCallback(() => {
    while (active.current < concurrency && queue.current.length > 0) {
      active.current += 1;
      void (async () => {
        try {
          for (let id = queue.current.shift(); id !== undefined; id = queue.current.shift()) {
            await processOne(id);
          }
        } finally {
          active.current -= 1;
          if (active.current === 0) {
            // Read settled state after React applies the last patches.
            setTimeout(() => latest.current.onIdle?.(itemsRef.current), 0);
          }
        }
      })();
    }
  }, [concurrency, processOne]);

  const addFiles = React.useCallback(
    (incoming: FileList | File[]) => {
      if (disabled) return;
      let list = Array.from(incoming);
      if (!multiple) list = list.slice(0, 1);

      const rejected = list.filter((f) => !isAccepted(f));
      list = list.filter(isAccepted);
      if (rejected.length > 0) setAnnouncement(t("upload.unsupported"));

      if (maxFiles !== undefined) {
        const used = itemsRef.current.filter((it) => it.status !== "error").length;
        const room = Math.max(0, maxFiles - used);
        if (list.length > room) {
          setAnnouncement(t("upload.tooMany", { count: maxFiles }));
          list = list.slice(0, room);
        }
      }

      const unsupported: UploadItem<T>[] = rejected.map((f) => ({
        id: nextId(),
        name: f.name,
        previewUrl: null,
        status: "error",
        progress: 0,
        error: t("upload.unsupported"),
      }));
      const fresh: UploadItem<T>[] = list.map((file) => {
        const id = nextId();
        files.current.set(id, file);
        queue.current.push(id);
        return { id, name: file.name, previewUrl: URL.createObjectURL(file), status: "queued", progress: 0 };
      });

      // Single-file mode replaces the previous item.
      setItems((prev) => {
        const base = multiple ? prev : [];
        if (!multiple) for (const it of prev) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        return [...base, ...fresh, ...unsupported];
      });
      pump();
    },
    [disabled, maxFiles, multiple, pump, t],
  );

  React.useEffect(() => {
    if (!enablePaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (pasted.length === 0) return;
      e.preventDefault();
      addFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enablePaste, disabled, addFiles]);

  const retry = (id: string) => {
    if (!files.current.has(id)) return;
    patch(id, { status: "queued", progress: 0, error: undefined });
    queue.current.push(id);
    pump();
  };

  const remove = (id: string) => {
    queue.current = queue.current.filter((q) => q !== id);
    files.current.delete(id);
    setItems((prev) => {
      const gone = prev.find((it) => it.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const dragging = dragDepth > 0;
  const heading = title ?? (multiple ? t("upload.dropzoneTitle") : t("upload.dropzoneTitleSingle"));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragDepth((d) => d + 1);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragDepth((d) => Math.max(0, d - 1));
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragDepth(0);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grain relative overflow-hidden rounded-xl border-2 border-dashed border-input/50 bg-card transition-colors",
          "data-[dragging]:border-primary data-[dragging]:bg-brand-soft/50",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={[...UPLOAD_LIMITS.acceptedMime, ".heic", ".heif"].join(",")}
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={cn(
            // Inset focus outline: the dropzone clips overflow.
            "flex w-full flex-col items-center justify-center gap-2 rounded-[inherit] text-center [--focus-offset:-4px]",
            compact ? "px-4 py-6" : "px-6 py-10 sm:py-14",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
          >
            <ImagePlusIcon className="size-6" />
          </span>
          <span className="text-base font-semibold">{heading}</span>
          <span className="text-sm text-muted-foreground">{hint ?? t("upload.dropzoneHint")}</span>
        </button>
      </div>

      {!hideList && items.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label={t("upload.uploading")}>
          {items.map((item) => (
            <UploadTile key={item.id} item={item} onRetry={retry} onRemove={remove} />
          ))}
        </ul>
      )}

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </div>
  );
}

function UploadTile<T>({
  item,
  onRetry,
  onRemove,
}: {
  item: UploadItem<T>;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const busy = item.status === "preparing" || item.status === "uploading" || item.status === "queued";
  return (
    <li className="group relative flex flex-col gap-1.5">
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-lg border bg-muted",
          item.status === "error" && "border-destructive/60",
        )}
      >
        {item.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={item.previewUrl} alt="" className={cn("size-full object-cover", busy && "opacity-60")} />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          {busy && <LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin text-white drop-shadow" />}
          {item.status === "done" && (
            <span className="flex size-7 items-center justify-center rounded-full bg-success text-success-foreground shadow">
              <CheckIcon aria-hidden="true" className="size-4" />
            </span>
          )}
          {item.status === "error" && (
            <span className="flex size-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow">
              <TriangleAlertIcon aria-hidden="true" className="size-4" />
            </span>
          )}
        </div>
        <div className="absolute top-1 right-1 flex gap-1 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
          {item.status === "error" && item.previewUrl && (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="size-7 rounded-full"
              onClick={() => onRetry(item.id)}
              aria-label={t("upload.retryFile", { name: item.name })}
            >
              <RotateCwIcon />
            </Button>
          )}
          {!busy && (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="size-7 rounded-full"
              onClick={() => onRemove(item.id)}
              aria-label={t("upload.removeFile", { name: item.name })}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {busy && (
        <Progress
          value={item.status === "uploading" ? item.progress : 0}
          className="h-1"
          aria-label={`${item.name}: ${item.status === "preparing" ? t("upload.preparing") : t("upload.uploading")}`}
        />
      )}
      <p className="truncate text-xs text-muted-foreground" title={item.name}>
        {item.status === "error" ? <span className="text-destructive">{item.error}</span> : item.name}
      </p>
    </li>
  );
}
