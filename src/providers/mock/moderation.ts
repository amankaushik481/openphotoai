/**
 * Mock moderation provider. Images are judged by the pixel marker (./markers.ts):
 * the nsfw flag blocks with category "sexual", the public-figure flag makes
 * detectPublicFigure() report a match. Text is blocked only by the explicit test token
 * `[mock:block-text]` — the safety module runs its own always-on rule filter on top.
 */
import type { ModerationProvider, ModerationResult } from "../types";
import { decodeMarker } from "./markers";

export const MOCK_BLOCK_TEXT_TOKEN = "[mock:block-text]";

export function createMockModerationProvider(): ModerationProvider {
  return {
    name: "mock",

    async checkText(text): Promise<ModerationResult> {
      if (text.toLowerCase().includes(MOCK_BLOCK_TEXT_TOKEN)) {
        return {
          allowed: false,
          categories: ["mock_blocked"],
          scores: { mock_blocked: 1 },
          reason: "Blocked by the mock moderation test token.",
          provider: "mock",
        };
      }
      return { allowed: true, categories: [], scores: { mock_blocked: 0 }, provider: "mock" };
    },

    async checkImage(bytes): Promise<ModerationResult> {
      const marker = await decodeMarker(bytes);
      if (marker?.nsfw) {
        return {
          allowed: false,
          categories: ["sexual"],
          scores: { sexual: 0.99 },
          reason: "Sexual content detected (mock marker).",
          provider: "mock",
        };
      }
      return { allowed: true, categories: [], scores: { sexual: 0.01 }, provider: "mock" };
    },

    async detectPublicFigure(bytes) {
      const marker = await decodeMarker(bytes);
      return marker?.publicFigure
        ? { isPublicFigure: true, name: "Mock Public Figure", confidence: 0.99 }
        : { isPublicFigure: false };
    },
  };
}
