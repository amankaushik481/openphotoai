import { describe, expect, it } from "vitest";
import {
  INITIAL_VIEWER_LOAD,
  viewerLoadStep,
  type ViewerLoad,
  type ViewerLoadEvent,
} from "@/components/gallery/viewer-load";

function run(events: ViewerLoadEvent[], start: ViewerLoad = INITIAL_VIEWER_LOAD) {
  let state = start;
  const refreshes: number[] = [];
  events.forEach((event, i) => {
    const step = viewerLoadStep(state, event);
    if (step.refresh) refreshes.push(i);
    state = step.state;
  });
  return { state, refreshes };
}

describe("viewer load / retry", () => {
  it("an expired URL refreshes the page data once, then shows the new URLs", () => {
    const { state, refreshes } = run([{ type: "error" }, { type: "data", sameItem: true }, { type: "loaded" }]);
    expect(refreshes).toEqual([0]);
    expect(state).toMatchObject({ phase: "ok", retried: false });
    expect(state.key).toBe(1); // re-created for the new URLs
  });

  // Regression: the refresh reset the state to "ok", so a file that keeps failing refreshed forever.
  it("a file that keeps failing stops after one automatic refresh", () => {
    const { state, refreshes } = run([
      { type: "error" },
      { type: "data", sameItem: true },
      { type: "error" },
      { type: "data", sameItem: true },
      { type: "error" },
    ]);
    expect(refreshes).toEqual([0]);
    expect(state.phase).toBe("failed");
  });

  // Regression: "Try again" refreshed, but the URL was identical within its signing window, so React
  // kept the same <img> and the browser never retried: the error card turned into a broken image.
  it("Try again re-creates the element (new key) and refreshes; a failure after it shows the card again", () => {
    const failed: ViewerLoad = { phase: "failed", retried: true, key: 3 };
    const retry = viewerLoadStep(failed, { type: "retry" });
    expect(retry.refresh).toBe(true);
    expect(retry.state).toEqual({ phase: "ok", retried: true, key: 4 });
    const again = viewerLoadStep(retry.state, { type: "error" });
    expect(again).toEqual({ state: { phase: "failed", retried: true, key: 4 }, refresh: false });
  });

  it("moving to another photo starts fresh", () => {
    const failed: ViewerLoad = { phase: "failed", retried: true, key: 2 };
    const { state } = run([{ type: "data", sameItem: false }], failed);
    expect(state).toEqual({ phase: "ok", retried: false, key: 3 });
  });

  it("a successful load re-arms the automatic refresh for a later expiry", () => {
    const { state, refreshes } = run([
      { type: "error" },
      { type: "data", sameItem: true },
      { type: "loaded" },
      { type: "error" },
    ]);
    expect(refreshes).toEqual([0, 3]);
    expect(state.phase).toBe("retrying");
  });
});
