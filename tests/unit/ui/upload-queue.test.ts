import { describe, expect, it, vi } from "vitest";
import { UploadQueue, isInFlight, sharedUploadQueue, type UploadQueueHandlers } from "@/components/app/upload-queue";

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

/** A controllable upload: each call waits until resolved/rejected by the test. */
function deferredUploads<T>() {
  const calls: {
    name: string;
    resolve: (v: T) => void;
    reject: (e: unknown) => void;
    progress: (f: number) => void;
  }[] = [];
  const upload: UploadQueueHandlers<T>["upload"] = (f, control) =>
    new Promise<T>((resolve, reject) => {
      calls.push({ name: f.name, resolve, reject, progress: control.progress });
    });
  return { calls, upload };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function newQueue<T>() {
  const revoked: string[] = [];
  const queue = new UploadQueue<T>({ createPreview: (f) => `blob:${f.name}`, revokePreview: (u) => revoked.push(u) });
  return { queue, revoked };
}

describe("UploadQueue", () => {
  it("uploads with bounded concurrency and reports status + progress", async () => {
    const { queue } = newQueue<string>();
    const { calls, upload } = deferredUploads<string>();
    const onUploaded = vi.fn();
    queue.setHandlers({ upload, concurrency: 2, onUploaded });
    queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    await flush();

    expect(calls.map((c) => c.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(queue.pending).toBe(3);
    expect(queue.getSnapshot().map((i) => i.status)).toEqual(["preparing", "preparing", "queued"]);

    calls[0]!.progress(0.5);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "uploading", progress: 50 });

    calls[0]!.resolve("A");
    await flush();
    expect(onUploaded).toHaveBeenCalledWith("A", expect.any(File));
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "done", result: "A" });
    expect(calls.map((c) => c.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("keeps the API error message and details, and retries failed files", async () => {
    const { queue } = newQueue<string>();
    const { calls, upload } = deferredUploads<string>();
    queue.setHandlers({ upload, describeError: (e) => `nope: ${(e as Error).message}` });
    const [id] = queue.add([file("a.jpg")]);
    await flush();
    calls[0]!.reject(Object.assign(new Error("blurry"), { details: { quality: { issues: [] } } }));
    await flush();
    expect(queue.getSnapshot()[0]).toMatchObject({
      status: "error",
      error: "nope: blurry",
      errorDetails: { quality: { issues: [] } },
    });
    expect(queue.pending).toBe(0);

    queue.retry(id!);
    await flush();
    expect(calls).toHaveLength(2);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "preparing", errorDetails: undefined });
  });

  it("removes successful items when asked and releases their previews", async () => {
    const { queue, revoked } = newQueue<string>();
    const { calls, upload } = deferredUploads<string>();
    queue.setHandlers({ upload, removeOnSuccess: true });
    queue.add([file("a.jpg")]);
    await flush();
    calls[0]!.resolve("ok");
    await flush();
    expect(queue.getSnapshot()).toHaveLength(0);
    expect(revoked).toEqual(["blob:a.jpg"]);
  });

  it("fires onIdle once the queue drains", async () => {
    const { queue } = newQueue<string>();
    const { calls, upload } = deferredUploads<string>();
    const onIdle = vi.fn();
    queue.setHandlers({ upload, concurrency: 1, onIdle });
    queue.add([file("a.jpg"), file("b.jpg")]);
    await flush();
    calls[0]!.resolve("1");
    await flush();
    expect(onIdle).not.toHaveBeenCalled();
    calls[1]!.reject(new Error("x"));
    await flush();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("drops queued files on remove, and reset keeps uploads already on the wire", async () => {
    const { queue } = newQueue<string>();
    const { calls, upload } = deferredUploads<string>();
    queue.setHandlers({ upload, concurrency: 1 });
    const [, second] = queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    queue.remove(second!);
    queue.reset();
    expect(queue.getSnapshot().map((i) => i.name)).toEqual(["a.jpg"]);
    calls[0]!.resolve("ok");
    await flush();
    expect(calls.map((c) => c.name)).toEqual(["a.jpg"]);
    expect(queue.getSnapshot().filter(isInFlight)).toHaveLength(0);
  });

  it("notifies subscribers with a new snapshot on every change", () => {
    const { queue } = newQueue<string>();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    const before = queue.getSnapshot();
    queue.addFailed("x.gif", "Unsupported");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()).not.toBe(before);
    unsubscribe();
    queue.clearSettled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // Regression: training-photo uploads lived inside the dropzone component, so leaving the photos step
  // (e.g. "Back" in the wizard, or a quick trip to another page) silently dropped every queued photo.
  it("a shared queue survives its component: queued files finish with the latest handlers", async () => {
    const queue = sharedUploadQueue<string>("test:photos");
    expect(sharedUploadQueue<string>("test:photos")).toBe(queue);
    expect(sharedUploadQueue<string>("test:other")).not.toBe(queue);

    const { calls, upload } = deferredUploads<string>();
    const firstMount = vi.fn();
    queue.setHandlers({ upload, concurrency: 1, onUploaded: firstMount });
    queue.add([file("a.jpg"), file("b.jpg")]);
    await flush();

    // The component unmounts (nothing is torn down) and a new one mounts with its own callbacks.
    const secondMount = vi.fn();
    queue.setHandlers({ upload, concurrency: 1, onUploaded: secondMount });
    calls[0]!.resolve("A");
    await flush();
    calls[1]!.resolve("B");
    await flush();

    expect(firstMount).not.toHaveBeenCalled();
    expect(secondMount.mock.calls.map((c) => c[0])).toEqual(["A", "B"]);
    expect(queue.getSnapshot().map((i) => i.status)).toEqual(["done", "done"]);
  });
  // Regression: the "leave page?" prompt lived in the dropzone, so after leaving the photos step (the
  // shared queue keeps uploading) a reload or tab close dropped the remaining files without asking.
  it("the queue itself guards page unload while files are in flight, even with no component mounted", async () => {
    const listeners = new Set<(e: BeforeUnloadEvent) => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: (e: BeforeUnloadEvent) => void) =>
        type === "beforeunload" && listeners.add(fn),
      removeEventListener: (type: string, fn: (e: BeforeUnloadEvent) => void) =>
        type === "beforeunload" && listeners.delete(fn),
    });
    try {
      const { queue } = newQueue<string>();
      const { calls, upload } = deferredUploads<string>();
      queue.setHandlers({ upload, concurrency: 1 });
      expect(listeners.size).toBe(0);
      queue.add([file("a.jpg"), file("b.jpg")]);
      expect(listeners.size).toBe(1);

      const event = { preventDefault: vi.fn(), returnValue: "x" } as unknown as BeforeUnloadEvent;
      for (const fn of listeners) fn(event);
      expect(event.preventDefault).toHaveBeenCalled();

      await flush();
      calls[0]!.resolve("A");
      await flush();
      expect(listeners.size).toBe(1); // b.jpg is still uploading
      calls[1]!.resolve("B");
      await flush();
      expect(listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
