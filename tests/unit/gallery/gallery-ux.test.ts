import { mutate as swrMutate, SWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { describe, expect, it } from "vitest";
import {
  filtersFromListKey,
  hiddenCountDelta,
  needsUrlRefresh,
  patchCachedMediaLists,
  patchMediaPages,
  SIGNED_URL_REFRESH_MS,
  type MediaPage,
} from "@/components/gallery/gallery-cache";
import { mediaPageUrl } from "@/components/gallery/gallery-filters";
import {
  RETURN_MAX_AGE_MS,
  rememberGalleryReturn,
  rememberGalleryScroll,
  takeGalleryRestore,
} from "@/components/gallery/gallery-return";
import { applyRangeSelection, toggledId } from "@/components/gallery/gallery-selection";
import {
  expectedOutputs,
  inFlightMediaJobs,
  inProgressLabel,
  refundNote,
  summarizeInProgress,
} from "@/components/gallery/in-progress";
import {
  VIEWER_TOOL_COSTS,
  createAgainHref,
  creditsLabel,
  variationCost,
  variationRequest,
} from "@/components/gallery/viewer-actions";
import {
  clampPan,
  requestNavFocus,
  swipeDirection,
  takeNavFocus,
  zoomAt,
} from "@/components/gallery/viewer-gestures";
import { CREDIT_COSTS } from "@/config/credits";
import type { JobDTO, JobInput, MediaDTO } from "@/types/domain";

const media = (over: Partial<MediaDTO> = {}): MediaDTO => ({
  id: "med_1",
  kind: "image",
  url: "u",
  thumbUrl: "t",
  downloadUrl: "d",
  mimeType: "image/jpeg",
  width: 1,
  height: 1,
  durationSec: null,
  prompt: null,
  packId: null,
  modelId: null,
  jobId: null,
  parentMediaId: null,
  folderId: null,
  isDraft: false,
  isFavorite: false,
  hidden: false,
  watermarked: false,
  scores: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const page = (items: MediaDTO[], over: Partial<MediaPage> = {}): MediaPage => ({
  media: items,
  nextCursor: null,
  ...over,
});

/** In-memory storage (sessionStorage stand-in). */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("gallery list cache", () => {
  it("patches loaded pages: removes deleted items, drops items leaving the filter, keeps cursors", () => {
    const pages = [
      page([media({ id: "a" }), media({ id: "b" })], { nextCursor: "c1", hiddenCount: 2 }),
      page([media({ id: "c" })]),
    ];
    const out = patchMediaPages(pages, (m) => (m.id === "b" ? null : m.id === "c" ? { ...m, hidden: true } : m), {}, 1);
    expect(out.map((p) => p.media.map((m) => m.id))).toEqual([["a"], []]);
    expect(out[0]!.nextCursor).toBe("c1");
    expect(out[0]!.hiddenCount).toBe(3);
    expect(out[1]!.hiddenCount).toBeUndefined();
  });

  it("recognises gallery list keys in SWR's cache (useSWRInfinite's $inf$ prefix)", () => {
    const key = unstable_serialize(() => mediaPageUrl({ favorite: true }, { limit: 40 }));
    expect(filtersFromListKey(key)).toEqual(expect.objectContaining({ favorite: true }));
    expect(filtersFromListKey(mediaPageUrl({}, { limit: 40 }))).toBeNull(); // a single page, not a list
    expect(filtersFromListKey("$inf$/api/jobs?limit=10")).toBeNull();
  });

  // Bug: deleting or favoriting a photo in the viewer left the gallery's cached pages untouched, so
  // going back showed the deleted photo (a 404 when clicked) and the old heart state.
  it("applies a viewer change to every cached gallery list in the real SWR cache", async () => {
    const cache = SWRConfig.defaultValue.cache;
    const allKey = unstable_serialize(() => mediaPageUrl({}, { limit: 40 }));
    const favKey = unstable_serialize(() => mediaPageUrl({ favorite: true }, { limit: 40 }));
    const other = "/api/models";
    const a = media({ id: "a", isFavorite: true, url: "list-url" });
    const b = media({ id: "b", isFavorite: true });
    await swrMutate(allKey, [page([a, b], { hiddenCount: 0 })], { revalidate: false });
    await swrMutate(favKey, [page([a, b], { hiddenCount: 0 })], { revalidate: false });
    await swrMutate(other, { models: [] }, { revalidate: false });

    // Unfavorite "a" in the viewer (its own copy carries fresh signed URLs).
    patchCachedMediaLists(cache, swrMutate, a, { ...a, isFavorite: false, url: "viewer-url" });
    await Promise.resolve();
    const all = cache.get(allKey)?.data as MediaPage[];
    const fav = cache.get(favKey)?.data as MediaPage[];
    expect(all[0]!.media.map((m) => [m.id, m.isFavorite, m.url])).toEqual([
      ["a", false, "list-url"],
      ["b", true, "u"],
    ]);
    expect(fav[0]!.media.map((m) => m.id)).toEqual(["b"]);

    // Delete "b".
    patchCachedMediaLists(cache, swrMutate, b, null);
    await Promise.resolve();
    expect((cache.get(allKey)?.data as MediaPage[])[0]!.media.map((m) => m.id)).toEqual(["a"]);
    expect((cache.get(favKey)?.data as MediaPage[])[0]!.media).toEqual([]);
    expect(cache.get(other)?.data).toEqual({ models: [] });
  });

  it("keeps the hidden count in step", () => {
    const m = media();
    expect(hiddenCountDelta(m, { ...m, hidden: true }, {})).toBe(1);
    expect(hiddenCountDelta({ ...m, hidden: true }, null, {})).toBe(-1);
    expect(hiddenCountDelta({ ...m, hidden: true }, null, { favorite: true })).toBe(0);
    expect(hiddenCountDelta(m, { ...m, isFavorite: true }, {})).toBe(0);
  });

  // Bug: lazy tiles below the fold kept the URLs fetched when the page loaded; after an hour on the
  // page they 403'd when scrolled into view.
  it("asks for a refresh before signed URLs can expire", () => {
    const now = 10 * 60 * 60_000;
    expect(needsUrlRefresh(undefined, now)).toBe(false);
    expect(needsUrlRefresh([page([], { fetchedAt: now - 60_000 })], now)).toBe(false);
    expect(
      needsUrlRefresh([page([], { fetchedAt: now - 60_000 }), page([], { fetchedAt: now - SIGNED_URL_REFRESH_MS - 1 })], now),
    ).toBe(true);
    expect(SIGNED_URL_REFRESH_MS).toBeLessThan(60 * 60_000); // URLs last at least an hour
  });
});

// Bug: the viewer's "Gallery" link and Escape pushed a fresh gallery page scrolled to the top, losing
// your place in a long, infinitely scrolled grid.
describe("returning to the gallery from the viewer", () => {
  it("restores the scroll position and the photo you were on, once, for the same list", () => {
    const s = memoryStorage();
    rememberGalleryScroll(s, "favorite=true", 2500, 1000);
    rememberGalleryReturn(s, "favorite=true", "med_9", 2000);
    expect(takeGalleryRestore(s, "favorite=true", 3000)).toEqual({ scrollY: 2500, mediaId: "med_9" });
    expect(takeGalleryRestore(s, "favorite=true", 3000)).toBeNull(); // consumed
  });

  it("ignores notes for another list, stale notes and junk", () => {
    const s = memoryStorage();
    rememberGalleryScroll(s, "", 800, 0);
    rememberGalleryReturn(s, "kind=video", "med_1", 0);
    expect(takeGalleryRestore(s, "", 10)).toBeNull();

    rememberGalleryReturn(s, "", "med_2", 0);
    expect(takeGalleryRestore(s, "", RETURN_MAX_AGE_MS + 1)).toBeNull();

    rememberGalleryReturn(s, "", "med_3", RETURN_MAX_AGE_MS);
    rememberGalleryScroll(s, "folderId=f", 900, RETURN_MAX_AGE_MS);
    expect(takeGalleryRestore(s, "", RETURN_MAX_AGE_MS + 5)).toEqual({ scrollY: null, mediaId: "med_3" });

    s.setItem("openshoot:gallery-return", "{not json");
    expect(takeGalleryRestore(s, "", 0)).toBeNull();
    expect(takeGalleryRestore(null, "", 0)).toBeNull();
  });
});

describe("gallery range selection", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("finds the single toggled tile", () => {
    expect(toggledId(["a"], ["a", "c"])).toBe("c");
    expect(toggledId(["a", "c"], ["a"])).toBe("c");
    expect(toggledId([], ["a", "b"])).toBeNull();
  });

  it("shift+click selects or clears everything between the anchor and the target", () => {
    expect(applyRangeSelection(order, ["b"], ["b", "e"], "b", "e")).toEqual(["b", "c", "d", "e"]);
    expect(applyRangeSelection(order, ["d"], ["d", "a"], "d", "a")).toEqual(["a", "b", "c", "d"]);
    expect(applyRangeSelection(order, ["a", "b", "c", "d"], ["a", "b", "d"], "a", "c")).toEqual(["d"]);
    expect(applyRangeSelection(order, [], ["c"], null, "c")).toEqual(["c"]);
    expect(applyRangeSelection(order, ["x"], ["x", "c"], "x", "c")).toEqual(["x", "c"]);
  });
});

describe("viewer gestures", () => {
  it("turns quick horizontal swipes into prev/next", () => {
    expect(swipeDirection({ dx: -120, dy: 10, ms: 200 })).toBe("next");
    expect(swipeDirection({ dx: 120, dy: -20, ms: 200 })).toBe("prev");
    expect(swipeDirection({ dx: -40, dy: 0, ms: 100 })).toBeNull(); // too short
    expect(swipeDirection({ dx: -120, dy: 110, ms: 200 })).toBeNull(); // diagonal (scrolling)
    expect(swipeDirection({ dx: -200, dy: 0, ms: 1500 })).toBeNull(); // slow drag
  });

  it("zooms in on the tapped point and never pans past the edges", () => {
    const size = { width: 400, height: 300 };
    expect(zoomAt({ x: 200, y: 150 }, size, 2)).toEqual({ scale: 2, x: 0, y: 0 });
    // Top-left corner: the image moves right/down by the most it can.
    expect(zoomAt({ x: 0, y: 0 }, size, 2)).toEqual({ scale: 2, x: 200, y: 150 });
    expect(clampPan({ scale: 2, x: -999, y: 999 }, size)).toEqual({ scale: 2, x: -200, y: 150 });
    expect(clampPan({ scale: 1, x: 50, y: 50 }, size)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  // Bug: activating "Next" moved to the next photo but dropped keyboard focus to <body>.
  it("remembers which arrow button to focus on the next photo, once", () => {
    requestNavFocus("next");
    expect(takeNavFocus()).toBe("next");
    expect(takeNavFocus()).toBeNull();
  });
});

describe("viewer create-from-this actions", () => {
  const generate = (over: Partial<Extract<JobInput, { type: "generate" }>> = {}): JobInput => ({
    type: "generate",
    modelId: "mdl_1",
    prompt: "me on a yacht at sunset",
    quality: "standard",
    numImages: 4,
    aspectRatio: "4:5",
    seed: 42,
    ...over,
  });

  it("shows starting prices and plain credit labels", () => {
    expect(VIEWER_TOOL_COSTS.edit).toBe(CREDIT_COSTS.edit);
    expect(VIEWER_TOOL_COSTS.video).toBe(CREDIT_COSTS.video5s);
    expect(VIEWER_TOOL_COSTS.tryOn).toBe(CREDIT_COSTS.tryOn);
    expect(creditsLabel(0)).toBe("Free");
    expect(creditsLabel(1)).toBe("1 credit");
    expect(creditsLabel(10, { from: true })).toBe("From 10 credits");
  });

  it("links “Use again” to the create page with the original prompt or pack (not the assembled prompt)", () => {
    expect(createAgainHref(generate())).toBe(
      "/app/create?mode=prompt&prompt=me+on+a+yacht+at+sunset&model=mdl_1",
    );
    expect(createAgainHref(generate({ prompt: undefined, packId: "dating", packPromptIndex: 3 }))).toBe(
      "/app/create?mode=pack&pack=dating&model=mdl_1",
    );
    expect(createAgainHref(generate({ prompt: undefined, fromDraftMediaId: "med_d" }))).toBeNull();
    expect(createAgainHref({ type: "upscale", sourceMediaId: "m", scale: 2, faceRestore: true })).toBeNull();
    expect(createAgainHref(undefined)).toBeNull();
  });

  it("makes variations with a new seed and prices them like the original", () => {
    const req = variationRequest(generate({ fromDraftMediaId: "med_d" }));
    expect(req).toEqual({
      type: "generate",
      modelId: "mdl_1",
      prompt: "me on a yacht at sunset",
      quality: "standard",
      numImages: 4,
      aspectRatio: "4:5",
    });
    expect(variationCost(req!, "trained")).toBe(4);
    expect(variationCost(req!, "instant")).toBe(8);
    expect(variationCost(variationRequest(generate({ quality: "draft" }))!, "instant")).toBe(0);
    expect(variationRequest(generate({ prompt: "  " }))).toBeNull();
  });
});

describe("gallery in-progress strip", () => {
  const job = (over: Partial<JobDTO>): Pick<JobDTO, "id" | "type" | "status" | "progress" | "input"> => ({
    id: "job_1",
    type: "generate",
    status: "running",
    progress: 50,
    input: { type: "generate", modelId: "m", prompt: "p", quality: "standard", numImages: 4, aspectRatio: "4:5" },
    ...over,
  });

  it("counts photos and videos still being made (training doesn't add media)", () => {
    const jobs = [
      job({ id: "a" }),
      job({ id: "b", type: "video", progress: 10, input: { type: "video", sourceMediaId: "m", durationSec: 5 } }),
      job({ id: "c", type: "train", input: { type: "train", modelId: "m" } }),
      job({ id: "d", status: "succeeded" }),
    ];
    expect(inFlightMediaJobs(jobs).map((j) => j.id)).toEqual(["a", "b"]);
    expect(summarizeInProgress(jobs)).toEqual({ jobs: 2, photos: 4, videos: 1, percent: 30 });
    expect(inProgressLabel({ photos: 4, videos: 1 })).toBe("Creating 4 photos and 1 video…");
    expect(inProgressLabel({ photos: 1, videos: 0 })).toBe("Creating 1 photo…");
    expect(expectedOutputs({ input: { type: "face_restore", sourceMediaId: "m" } })).toBe(1);
    expect(refundNote({ status: "failed", creditsRefunded: 2 })).toBe("2 credits refunded");
    expect(refundNote({ status: "failed", creditsRefunded: 0 })).toBeNull();
  });
});
