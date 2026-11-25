/**
 * Load / retry state of the viewer's photo or video (pure, unit-tested).
 *
 * A load error usually means the signed URL expired while the page sat open: the viewer refreshes the
 * page data once (new URLs) on its own. A second error, or one right after "Try again", shows the
 * error card instead of refreshing again (a broken file would otherwise refresh forever). `key`
 * changes whenever the element must be re-created: signed URLs are identical within a signing
 * window, so an unchanged `src` would never make the browser try again.
 */
export type ViewerLoadPhase = "ok" | "retrying" | "failed";

export interface ViewerLoad {
  phase: ViewerLoadPhase;
  /** A refresh was already spent on this failure. */
  retried: boolean;
  /** Bumped to re-create the <img>/<video> (forces a new request even for the same URL). */
  key: number;
}

export type ViewerLoadEvent =
  /** The element fired `error`. */
  | { type: "error" }
  /** The element loaded: a later expiry may auto-refresh again. */
  | { type: "loaded" }
  /** The user pressed "Try again". */
  | { type: "retry" }
  /** New page data arrived (refresh, or another item). */
  | { type: "data"; sameItem: boolean };

export const INITIAL_VIEWER_LOAD: ViewerLoad = { phase: "ok", retried: false, key: 0 };

/** The next state, and whether to refresh the page data (router.refresh()). */
export function viewerLoadStep(state: ViewerLoad, event: ViewerLoadEvent): { state: ViewerLoad; refresh: boolean } {
  switch (event.type) {
    case "error":
      if (state.phase !== "ok" || state.retried) return { state: { ...state, phase: "failed" }, refresh: false };
      return { state: { ...state, phase: "retrying", retried: true }, refresh: true };
    case "loaded":
      return { state: state.retried ? { ...state, retried: false } : state, refresh: false };
    case "retry":
      // Re-create the element now (it may just have been a network blip) and fetch fresh URLs too.
      return { state: { phase: "ok", retried: true, key: state.key + 1 }, refresh: true };
    case "data":
      return {
        state: { phase: "ok", retried: event.sameItem ? state.retried : false, key: state.key + 1 },
        refresh: false,
      };
  }
}
