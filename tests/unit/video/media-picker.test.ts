import { describe, expect, it } from "vitest";
import {
  flattenMediaPages,
  MEDIA_PICKER_PAGE_SIZE,
  mediaPickerKey,
  mediaPickerUrl,
  type MediaPage,
} from "@/components/app/media-picker";
import type { MediaDTO } from "@/types/domain";

function dto(id: string, kind: MediaDTO["kind"] = "image"): MediaDTO {
  return {
    id,
    kind,
    url: `https://cdn.test/${id}`,
    thumbUrl: `https://cdn.test/${id}/thumb`,
    downloadUrl: `https://cdn.test/${id}?dl=1`,
    mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
    width: 1024,
    height: 1280,
    durationSec: kind === "video" ? 5 : null,
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
    createdAt: "2026-11-24T00:00:00.000Z",
  };
}

describe("mediaPickerUrl", () => {
  it("requests one page of the user's images", () => {
    expect(MEDIA_PICKER_PAGE_SIZE).toBe(60);
    expect(mediaPickerUrl({ kind: "image", favoritesOnly: false })).toBe("/api/media?kind=image&limit=60");
  });

  it("adds the favorites filter and cursor", () => {
    const url = new URL(mediaPickerUrl({ kind: "video", favoritesOnly: true, cursor: "abc/=+" }), "http://x");
    expect(url.pathname).toBe("/api/media");
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: "video", limit: "60", favorite: "true", cursor: "abc/=+" });
  });
});

describe("mediaPickerKey", () => {
  const page = (nextCursor: string | null): MediaPage => ({ media: [], nextCursor });

  it("fetches nothing while closed", () => {
    expect(mediaPickerKey({ kind: "image", favoritesOnly: false }, false)(0, null)).toBeNull();
  });

  it("follows nextCursor and stops at the last page", () => {
    const key = mediaPickerKey({ kind: "image", favoritesOnly: true }, true);
    expect(key(0, null)).toBe("/api/media?kind=image&limit=60&favorite=true");
    expect(key(1, page("c2"))).toBe("/api/media?kind=image&limit=60&favorite=true&cursor=c2");
    expect(key(2, page(null))).toBeNull();
  });
});

describe("flattenMediaPages", () => {
  it("concatenates pages, drops duplicates and other kinds", () => {
    const pages: MediaPage[] = [
      { media: [dto("a"), dto("b"), dto("v", "video")], nextCursor: "c" },
      { media: [dto("b"), dto("c")], nextCursor: null },
    ];
    expect(flattenMediaPages(pages, "image").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(flattenMediaPages(pages, "video").map((m) => m.id)).toEqual(["v"]);
    expect(flattenMediaPages(undefined, "image")).toEqual([]);
  });
});
