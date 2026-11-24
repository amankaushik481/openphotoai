/**
 * Accessibility helpers: talking-video captions, pack hero scrim contrast, CardTitle heading levels.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { packTextScrim } from "@/components/app/pack-card";
import { CardTitle } from "@/components/ui/card";
import { SPEECH_WORDS_PER_SEC } from "@/config/credits";
import { buildCaptionCues, toWebVtt } from "@/lib/captions";
import { listPacks } from "@/server/packs/registry";

/** WCAG contrast of white text over `hex` darkened by a black overlay of `alpha` (sRGB compositing). */
function whiteContrastUnder(hex: string, alpha: number): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => lin((parseInt(h.slice(i, i + 2), 16) / 255) * (1 - alpha)));
  return 1.05 / (0.2126 * r! + 0.7152 * g! + 0.0722 * b! + 0.05);
}

describe("talking-video captions", () => {
  const script =
    "Hi, I'm Sam — welcome to my channel! Every week I share one quick tip to make your mornings easier, " +
    "calmer and a little more fun, so subscribe and let's get started together right now.";

  it("spreads cues over the real duration, in order, without gaps", () => {
    const cues = buildCaptionCues(script, 12);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]!.start).toBe(0);
    expect(cues.at(-1)!.end).toBeCloseTo(12, 3);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeCloseTo(cues[i - 1]!.end, 3);
    // Every word is captioned exactly once.
    expect(cues.map((c) => c.text.replace(/\n/g, " ")).join(" ")).toBe(script.replace(/\s+/g, " "));
  });

  it("keeps cues to two lines of at most 42 characters", () => {
    for (const cue of buildCaptionCues(script.repeat(3))) {
      const lines = cue.text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it("estimates the duration from the speech rate when it's unknown", () => {
    const words = script.split(/\s+/).length;
    expect(buildCaptionCues(script, null).at(-1)!.end).toBeCloseTo(words / SPEECH_WORDS_PER_SEC, 2);
    expect(buildCaptionCues("   ")).toEqual([]);
  });

  it("serializes WebVTT", () => {
    const vtt = toWebVtt([{ start: 0, end: 2.5, text: "Hello --> there" }, { start: 2.5, end: 61.25, text: "Bye" }]);
    expect(vtt).toBe("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.500\nHello → there\n\n2\n00:00:02.500 --> 00:01:01.250\nBye\n");
  });
});

describe("pack hero scrim", () => {
  it("keeps white text ≥ 4.5:1 over both gradient stops of every pack", async () => {
    for (const pack of await listPacks()) {
      const alpha = packTextScrim(pack.colors);
      for (const stop of pack.colors ?? []) {
        expect(whiteContrastUnder(stop, alpha), `${pack.slug} ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("leaves dark packs mostly untouched", () => {
    expect(packTextScrim(["#1e1b4b", "#312e81"])).toBe(0.15);
  });
});

describe("CardTitle", () => {
  it("is an h2 by default and takes a level", () => {
    expect(renderToStaticMarkup(<CardTitle>Profile</CardTitle>)).toMatch(/^<h2[^>]*data-slot="card-title"/);
    expect(renderToStaticMarkup(<CardTitle as="h1">Sign in</CardTitle>)).toMatch(/^<h1[\s>]/);
    expect(renderToStaticMarkup(<CardTitle as="p">100</CardTitle>)).toMatch(/^<p[\s>]/);
  });
});
