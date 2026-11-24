import { describe, expect, it } from "vitest";

import OpengraphImage, { size } from "@/app/opengraph-image";
import PackOgImage from "@/app/(marketing)/packs/[slug]/opengraph-image";
import TwitterImage from "@/app/twitter-image";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

async function bytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

describe("social images", () => {
  it("renders the site-wide Open Graph and Twitter cards as 1200×630 PNGs", async () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    for (const res of [OpengraphImage(), TwitterImage()]) {
      expect(res.headers.get("content-type")).toBe("image/png");
      expect([...(await bytes(res)).slice(0, 4)]).toEqual(PNG_SIGNATURE);
    }
  });

  it("renders a per-pack card, and a generic one for an unknown slug", async () => {
    for (const slug of ["linkedin-headshots", "does-not-exist"]) {
      const res = await PackOgImage({ params: Promise.resolve({ slug }) });
      expect([...(await bytes(res)).slice(0, 4)]).toEqual(PNG_SIGNATURE);
    }
  });
});
