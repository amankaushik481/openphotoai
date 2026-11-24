import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "@/components/gallery/download-zip";
import {
  galleryHref,
  hasNarrowingFilters,
  matchesGalleryFilters,
  mediaPageUrl,
  parseGalleryFilters,
  serializeGalleryFilters,
  viewerHref,
  viewOf,
  withView,
} from "@/components/gallery/gallery-filters";
import { applyBulkLocally } from "@/components/gallery/use-gallery";
import type { MediaDTO } from "@/types/domain";

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

describe("gallery filters", () => {
  it("round-trips through the query string and drops junk", () => {
    const params = new URLSearchParams(
      "folderId=fld_1&favorite=true&kind=video&modelId=mdl_1&packId=dating&batchId=bat_1&showHidden=1&cursor=x",
    );
    const f = parseGalleryFilters(params);
    expect(f).toEqual({
      folderId: "fld_1",
      favorite: true,
      kind: "video",
      modelId: "mdl_1",
      packId: "dating",
      batchId: "bat_1",
      showHidden: true,
    });
    expect(serializeGalleryFilters(f)).toBe(
      "folderId=fld_1&favorite=true&kind=video&modelId=mdl_1&packId=dating&batchId=bat_1&showHidden=true",
    );
    expect(parseGalleryFilters(new URLSearchParams("kind=gif&favorite=no&folderId=../etc"))).toEqual({
      folderId: undefined,
      favorite: undefined,
      kind: undefined,
      modelId: undefined,
      packId: undefined,
      batchId: undefined,
      showHidden: undefined,
    });
  });

  it("builds gallery, viewer and API URLs", () => {
    expect(galleryHref({})).toBe("/app/gallery");
    expect(galleryHref({ favorite: true })).toBe("/app/gallery?favorite=true");
    expect(viewerHref("med_1", { folderId: "fld_1" })).toBe("/app/gallery/med_1?folderId=fld_1");
    expect(mediaPageUrl({ kind: "video" }, { cursor: "abc", limit: 40 })).toBe(
      "/api/media?kind=video&limit=40&cursor=abc",
    );
  });

  it("maps the All / Favorites / Videos view", () => {
    expect(viewOf({})).toBe("all");
    expect(viewOf(withView({ folderId: "f" }, "favorites"))).toBe("favorites");
    expect(withView({ favorite: true, packId: "p" }, "videos")).toEqual({
      favorite: undefined,
      kind: "video",
      packId: "p",
    });
    expect(hasNarrowingFilters({ showHidden: true })).toBe(false);
    expect(hasNarrowingFilters({ batchId: "b" })).toBe(true);
  });

  it("drops locally updated items that leave the filtered list", () => {
    expect(matchesGalleryFilters(media({ hidden: true }), {})).toBe(false);
    expect(matchesGalleryFilters(media({ hidden: true }), { showHidden: true })).toBe(true);
    expect(matchesGalleryFilters(media(), { favorite: true })).toBe(false);
    expect(matchesGalleryFilters(media({ folderId: "a" }), { folderId: "b" })).toBe(false);
    expect(applyBulkLocally(media(), "move", "fld_2")?.folderId).toBe("fld_2");
    expect(applyBulkLocally(media(), "hide")?.hidden).toBe(true);
    expect(applyBulkLocally(media(), "delete")).toBeNull();
  });
});

describe("filenameFromDisposition", () => {
  it("reads plain and RFC 5987 filenames", () => {
    expect(filenameFromDisposition('attachment; filename="openshoot-2026-11-24.zip"')).toBe("openshoot-2026-11-24.zip");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''photos%20(1).zip")).toBe("photos (1).zip");
    expect(filenameFromDisposition(null)).toBeNull();
  });
});
