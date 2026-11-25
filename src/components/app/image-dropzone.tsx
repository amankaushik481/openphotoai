"use client";

import * as React from "react";
import { CheckIcon, ImagePlusIcon, LoaderCircleIcon, RotateCwIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CropMarks, GreasePencilCross, darkroomMotion } from "@/components/ui/darkroom";
import { Progress } from "@/components/ui/progress";
import { ImageDecodeError, prepareImageForUpload, type OutputType } from "@/components/app/image-resize";
import { UploadQueue, type UploadItem } from "@/components/app/upload-queue";
import { uploadMultipart } from "@/components/app/upload-request";
import { UPLOAD_LIMITS } from "@/config/app";
import { ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export type { UploadItem, UploadStatus } from "@/components/app/upload-queue";

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
  /** Show only some items as tiles (e.g. hide rejections the parent explains itself). */
  showItem?: (item: UploadItem<T>) => boolean;
  /**
   * Use this queue instead of a private one. Pass `sharedUploadQueue(key)` to keep uploads going (and
   * visible) across in-app navigation.
   */
  queue?: UploadQueue<T>;
  title?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
  onUploaded?: (result: T, file: File) => void;
  onError?: (error: ApiClientError | Error, file: File) => void;
  /** Fires when the queue drains (all items done or failed). */
  onIdle?: (items: UploadItem<T>[]) => void;
}

function isAccepted(file: File): boolean {
  if ((UPLOAD_LIMITS.acceptedMime as readonly string[]).includes(file.type)) return true;
  // Some platforms report HEIC with an empty type.
  return file.type === "" && /\.(heic|heif)$/i.test(file.name);
}

/** Subscribe to a queue's items (re-renders on every status/progress change). */
export function useUploadItems<T>(queue: UploadQueue<T>): readonly UploadItem<T>[] {
  return React.useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
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
  showItem,
  queue: externalQueue,
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
  const [ownQueue] = React.useState(() => new UploadQueue<T>());
  const queue = externalQueue ?? ownQueue;
  const items = useUploadItems(queue);
  const [dragDepth, setDragDepth] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  /** Visible counterpart of the "too many files" announcement (extra files are dropped). */
  const [limitNotice, setLimitNotice] = React.useState<string | null>(null);
  // The queue itself asks before a page unload while files are in flight (see UploadQueue).

  const describe = React.useCallback(
    (err: unknown) =>
      err instanceof ImageDecodeError
        ? t("upload.unreadable")
        : err instanceof ApiClientError
          ? err.message || errorMessage(err.code)
          : t("upload.failed"),
    [t],
  );

  // The queue always runs with the latest props (a shared queue keeps the last ones after unmount).
  React.useEffect(() => {
    queue.setHandlers({
      concurrency,
      removeOnSuccess,
      describeError: describe,
      upload: async (file, control) => {
        control.preparing();
        const prepared = await prepareImageForUpload(file, { maxSide, quality, type: outputType });
        if (prepared.file.size > UPLOAD_LIMITS.maxBytes)
          throw new ApiClientError("payload_too_large", t("upload.tooLarge"), 413);
        const form = new FormData();
        form.append(fieldName, prepared.file, prepared.file.name);
        for (const [k, v] of Object.entries(extraFields ?? {})) form.append(k, v);
        control.progress(0);
        return uploadMultipart<T>(endpoint, form, { headers, onProgress: control.progress });
      },
      onUploaded: (result, file) => {
        setAnnouncement(`${file.name}: ${t("upload.uploaded")}`);
        onUploaded?.(result, file);
      },
      onError: (error, file) => {
        setAnnouncement(`${file.name}: ${describe(error)}`);
        onError?.(error, file);
      },
      onIdle: (settled) => onIdle?.([...settled]),
    });
  });

  // A private queue goes away with the component: release its preview URLs.
  React.useEffect(() => {
    if (externalQueue) return;
    return () => ownQueue.reset();
  }, [externalQueue, ownQueue]);

  const addFiles = React.useCallback(
    (incoming: FileList | File[]) => {
      if (disabled) return;
      let list = Array.from(incoming);
      if (!multiple) list = list.slice(0, 1);

      const rejected = list.filter((f) => !isAccepted(f));
      list = list.filter(isAccepted);
      if (rejected.length > 0) setAnnouncement(t("upload.unsupported"));

      if (maxFiles !== undefined) {
        const used = queue.getSnapshot().filter((it) => it.status !== "error").length;
        const room = Math.max(0, maxFiles - used);
        if (list.length > room) {
          setAnnouncement(t("upload.tooMany", { count: maxFiles }));
          setLimitNotice(t("upload.tooMany", { count: maxFiles }));
          list = list.slice(0, room);
        } else {
          setLimitNotice(null);
        }
      }

      // Single-file mode replaces the previous item.
      if (!multiple) queue.reset();
      queue.add(list);
      for (const f of rejected) queue.addFailed(f.name, t("upload.unsupported"));
    },
    [disabled, maxFiles, multiple, queue, t],
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

  const retry = (id: string) => queue.retry(id);
  const remove = (id: string) => queue.remove(id);
  const tiles = showItem ? items.filter(showItem) : items;

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
          // An empty frame on the light table: dashed border, crop marks, safelight when something is dragged over.
          "grain relative overflow-hidden rounded-xs border border-dashed border-foreground/35 bg-card transition-colors",
          "data-[dragging]:border-solid data-[dragging]:border-safelight-ink data-[dragging]:bg-safelight/[0.06]",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        )}
      >
        <CropMarks inset="0.625rem" size="0.875rem" weight="1.5px" className="text-foreground/45" />
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
          <ImagePlusIcon aria-hidden="true" className="size-7 text-foreground/70" strokeWidth={1.25} />
          <span className="text-base font-semibold">{heading}</span>
          <span className="text-sm text-muted-foreground">{hint ?? t("upload.dropzoneHint")}</span>
        </button>
      </div>

      {!hideList && tiles.length > 0 && (
        <ul className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-3 lg:grid-cols-6" aria-label={t("upload.uploading")}>
          {tiles.map((item) => (
            <UploadTile key={item.id} item={item} onRetry={retry} onRemove={remove} />
          ))}
        </ul>
      )}

      {limitNotice && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {limitNotice}
        </p>
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
      {/* A contact-sheet frame: develops (latent → positive) while uploading; a reject gets the grease-pencil ✕. */}
      <div className="relative aspect-square rounded-[1px] bg-darkroom">
        <div className="absolute inset-0 overflow-hidden rounded-[1px]">
          {item.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img
              src={item.previewUrl}
              alt=""
              className={cn(
                "size-full object-cover",
                busy && cn("grayscale", darkroomMotion.latent),
                item.status === "error" && "opacity-60 grayscale",
              )}
            />
          )}
        </div>
        {item.status === "error" && <GreasePencilCross />}
        <div className="absolute inset-0 flex items-center justify-center">
          {busy && <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin text-white drop-shadow" />}
          {item.status === "done" && (
            <span className="flex size-6 items-center justify-center rounded-xs bg-success text-success-foreground">
              <CheckIcon aria-hidden="true" className="size-3.5" />
            </span>
          )}
        </div>
        <div className="absolute top-1 right-1 flex gap-1 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
          {item.status === "error" && item.previewUrl && (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="size-7 rounded-xs"
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
              className="size-7 rounded-xs"
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
      {/* Errors wrap in full (a one-line truncate hid the reason in narrow tiles). */}
      <p
        className={cn(
          "font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground",
          item.status === "error" ? "break-words" : "truncate",
        )}
        title={item.status === "error" ? `${item.name}: ${item.error}` : item.name}
      >
        {item.status === "error" ? <span className="text-safelight-ink">✕ {item.error}</span> : item.name}
      </p>
    </li>
  );
}
