/**
 * Framework-free upload queue behind `ImageDropzone`: per-file status and progress, bounded
 * concurrency, retry and removal, with a `subscribe`/`getSnapshot` pair for `useSyncExternalStore`.
 *
 * A dropzone owns a private queue by default (dropped with the component). A *shared* queue
 * (`sharedUploadQueue(key)`) lives at module scope instead, so uploads keep going, and their results
 * stay visible, when the user navigates away inside the app and comes back.
 */

export type UploadStatus = "queued" | "preparing" | "uploading" | "done" | "error";

export interface UploadItem<T = unknown> {
  id: string;
  name: string;
  previewUrl: string | null;
  status: UploadStatus;
  /** 0–100 */
  progress: number;
  error?: string;
  /** `details` of the API error (e.g. the quality report of a rejected photo). */
  errorDetails?: unknown;
  result?: T;
}

export interface UploadControl {
  /** The file is being decoded / resized before upload. */
  preparing: () => void;
  /** Upload progress, 0–1. */
  progress: (fraction: number) => void;
}

export interface UploadQueueHandlers<T> {
  /** Prepare and send one file; resolves with the server's response. */
  upload: (file: File, control: UploadControl) => Promise<T>;
  /** User-facing message for a failed upload. */
  describeError?: (error: unknown) => string;
  onUploaded?: (result: T, file: File) => void;
  onError?: (error: Error, file: File) => void;
  /** Fires when the queue drains (nothing queued or in flight). */
  onIdle?: (items: readonly UploadItem<T>[]) => void;
  /** Drop successful items from the list (when the caller renders results itself). */
  removeOnSuccess?: boolean;
  concurrency?: number;
}

export interface UploadQueueOptions {
  /** Preview URL for a queued file (default: `URL.createObjectURL`). */
  createPreview?: (file: File) => string | null;
  revokePreview?: (url: string) => void;
}

let seq = 0;
const nextId = () => `up_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const defaultCreatePreview = (file: File): string | null =>
  typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
const defaultRevokePreview = (url: string): void => {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
};

const IN_FLIGHT: ReadonlySet<UploadStatus> = new Set(["queued", "preparing", "uploading"]);

export function isInFlight(item: Pick<UploadItem, "status">): boolean {
  return IN_FLIGHT.has(item.status);
}

export class UploadQueue<T = unknown> {
  private items: readonly UploadItem<T>[] = [];
  private readonly files = new Map<string, File>();
  private waiting: string[] = [];
  private active = 0;
  private handlers: UploadQueueHandlers<T> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly createPreview: (file: File) => string | null;
  private readonly revokePreview: (url: string) => void;

  constructor(options: UploadQueueOptions = {}) {
    this.createPreview = options.createPreview ?? defaultCreatePreview;
    this.revokePreview = options.revokePreview ?? defaultRevokePreview;
  }

  /** The latest handlers win (callers set them on every render); queued files use them when they start. */
  setHandlers(handlers: UploadQueueHandlers<T>): void {
    this.handlers = handlers;
    this.pump();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly UploadItem<T>[] => this.items;

  /** Files queued or in flight. */
  get pending(): number {
    return this.items.filter(isInFlight).length;
  }

  /** Queue files for upload; returns the new item ids. */
  add(files: readonly File[]): string[] {
    const fresh: UploadItem<T>[] = files.map((file) => {
      const id = nextId();
      this.files.set(id, file);
      this.waiting.push(id);
      return { id, name: file.name, previewUrl: this.createPreview(file), status: "queued", progress: 0 };
    });
    this.set([...this.items, ...fresh]);
    this.pump();
    return fresh.map((it) => it.id);
  }

  /** Show a file that was refused before upload (e.g. an unsupported type); it can't be retried. */
  addFailed(name: string, error: string): void {
    this.set([...this.items, { id: nextId(), name, previewUrl: null, status: "error", progress: 0, error }]);
  }

  retry(id: string): void {
    const item = this.items.find((it) => it.id === id);
    if (!item || item.status !== "error" || !this.files.has(id)) return;
    this.patch(id, { status: "queued", progress: 0, error: undefined, errorDetails: undefined });
    this.waiting.push(id);
    this.pump();
  }

  /** Remove an item (a queued file is dropped; an upload already on the wire still completes server-side). */
  remove(id: string): void {
    this.waiting = this.waiting.filter((w) => w !== id);
    this.files.delete(id);
    const gone = this.items.find((it) => it.id === id);
    if (!gone) return;
    if (gone.previewUrl) this.revokePreview(gone.previewUrl);
    this.set(this.items.filter((it) => it.id !== id));
  }

  /** Remove every item that isn't queued or uploading. */
  clearSettled(): void {
    for (const item of this.items) if (!isInFlight(item)) this.remove(item.id);
  }

  /** Drop everything that hasn't started and every settled item (single-file dropzones replace their file). */
  reset(): void {
    for (const id of [...this.waiting]) this.remove(id);
    this.clearSettled();
  }

  private set(items: readonly UploadItem<T>[]): void {
    this.items = items;
    for (const listener of [...this.listeners]) listener();
  }

  private patch(id: string, update: Partial<UploadItem<T>>): void {
    if (!this.items.some((it) => it.id === id)) return;
    this.set(this.items.map((it) => (it.id === id ? { ...it, ...update } : it)));
  }

  private pump(): void {
    const handlers = this.handlers;
    if (!handlers) return;
    const limit = Math.max(1, handlers.concurrency ?? 3);
    while (this.active < limit && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      this.active += 1;
      void this.process(id).finally(() => {
        this.active -= 1;
        this.pump();
        if (this.active === 0 && this.waiting.length === 0) this.handlers?.onIdle?.(this.items);
      });
    }
  }

  private async process(id: string): Promise<void> {
    const file = this.files.get(id);
    const handlers = this.handlers;
    if (!file || !handlers) return;
    try {
      this.patch(id, { status: "preparing", progress: 0, error: undefined });
      const result = await handlers.upload(file, {
        preparing: () => this.patch(id, { status: "preparing" }),
        progress: (fraction) =>
          this.patch(id, { status: "uploading", progress: Math.max(1, Math.min(100, Math.round(fraction * 100))) }),
      });
      // Read the handlers again: the component that queued the file may have been replaced meanwhile.
      const latest = this.handlers ?? handlers;
      this.patch(id, { status: "done", progress: 100, result });
      latest.onUploaded?.(result, file);
      if (latest.removeOnSuccess) this.remove(id);
    } catch (err) {
      const latest = this.handlers ?? handlers;
      const error = err instanceof Error ? err : new Error(String(err));
      const details = (err as { details?: unknown } | null)?.details;
      this.patch(id, {
        status: "error",
        error: latest.describeError?.(err) ?? error.message,
        ...(details !== undefined ? { errorDetails: details } : {}),
      });
      latest.onError?.(error, file);
    }
  }
}

const shared = new Map<string, UploadQueue<unknown>>();

/**
 * A queue that outlives the component using it (module scope, one per `key`), so uploads continue
 * and their results stay visible across in-app navigation. Cleared on a full page load.
 */
export function sharedUploadQueue<T>(key: string): UploadQueue<T> {
  let queue = shared.get(key);
  if (!queue) {
    queue = new UploadQueue<unknown>();
    shared.set(key, queue);
  }
  return queue as UploadQueue<T>;
}
