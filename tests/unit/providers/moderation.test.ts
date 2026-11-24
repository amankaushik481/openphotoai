import { describe, expect, it } from "vitest";
import { createMockModerationProvider } from "@/providers/mock/moderation";
import { readFixture, readSelfie } from "../../fixtures";

const moderation = createMockModerationProvider();

describe("mock moderation provider", () => {
  it("blocks images carrying the nsfw marker flag", async () => {
    const blocked = await moderation.checkImage(readSelfie("nsfw-01"));
    expect(blocked).toMatchObject({ allowed: false, categories: ["sexual"], provider: "mock" });

    const ok = await moderation.checkImage(readSelfie("alice-01"));
    expect(ok).toMatchObject({ allowed: true, categories: [] });
    expect((await moderation.checkImage(readFixture("mask.png"))).allowed).toBe(true);
    expect((await moderation.checkImage(new TextEncoder().encode("not an image"))).allowed).toBe(true);
  });

  it("blocks text only for the explicit test token", async () => {
    expect((await moderation.checkText("me on a yacht [MOCK:block-text]")).allowed).toBe(false);
    expect((await moderation.checkText("me on a yacht at sunset")).allowed).toBe(true);
    // Rule-based filtering lives in the safety module, not in the mock provider.
    expect((await moderation.checkText("nude photo")).allowed).toBe(true);
  });

  it("detects public figures from the marker flag", async () => {
    expect(await moderation.detectPublicFigure?.(readSelfie("celebrity-01"))).toMatchObject({ isPublicFigure: true });
    expect(await moderation.detectPublicFigure?.(readSelfie("alice-01"))).toEqual({ isPublicFigure: false });
  });
});
