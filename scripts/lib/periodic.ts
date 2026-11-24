/** Run a background task at most every `intervalMs`, never overlapping itself. */

export interface PeriodicTask {
  /** Start a run if one is due and none is in flight. Never throws (errors go to `onError`). */
  tick(now?: number): boolean;
  /** True while a run is in flight. */
  readonly running: boolean;
  /** Resolves when the in-flight run (if any) has settled. */
  idle(): Promise<void>;
}

export function createPeriodicTask(opts: {
  intervalMs: number;
  run: () => Promise<void>;
  onError?: (err: unknown) => void;
  /** Run on the first tick (default true) instead of waiting one interval. */
  runImmediately?: boolean;
}): PeriodicTask {
  let inFlight: Promise<void> | null = null;
  let lastStart: number | null = null;

  return {
    tick(now = Date.now()) {
      if (inFlight) return false;
      const due = lastStart === null ? opts.runImmediately !== false : now - lastStart >= opts.intervalMs;
      if (lastStart === null && !due) lastStart = now;
      if (!due) return false;
      lastStart = now;
      // `run` starts synchronously; `.finally` always settles later, after inFlight is assigned.
      inFlight = (async () => {
        try {
          await opts.run();
        } catch (err) {
          opts.onError?.(err);
        }
      })().finally(() => {
        inFlight = null;
      });
      return true;
    },
    get running() {
      return inFlight !== null;
    },
    idle() {
      return inFlight ?? Promise.resolve();
    },
  };
}
