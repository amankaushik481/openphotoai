"use client";

import * as React from "react";

import { buildCaptionCues } from "@/lib/captions";

/** One captions track per <video>, reused across re-renders and Strict Mode's double effects. */
const tracks = new WeakMap<HTMLVideoElement, TextTrack>();

/**
 * Attach a closed-captions track built from a talking video's script (WCAG 1.2.2). Cues are added
 * through the TextTrack API, so nothing is fetched (no blob/data URL for a CSP to block). Viewers turn
 * them on from the player's CC menu. Pass `null` for silent clips: no track is added.
 */
export function useScriptCaptions(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  script: string | null | undefined,
  durationSec?: number | null,
): void {
  React.useEffect(() => {
    const video = videoRef.current;
    const text = script?.trim();
    if (!video || !text || typeof VTTCue === "undefined" || typeof video.addTextTrack !== "function") return;

    let track = tracks.get(video);
    if (!track) {
      track = video.addTextTrack("captions", "Captions (from script)");
      tracks.set(video, track);
    }
    const target = track;

    const fill = (duration: number | null | undefined) => {
      for (const cue of Array.from(target.cues ?? [])) target.removeCue(cue);
      for (const cue of buildCaptionCues(text, duration)) target.addCue(new VTTCue(cue.start, cue.end, cue.text));
    };
    fill(durationSec);

    // The stored duration may be missing or rounded: re-time against the real clip once it's known.
    const onMetadata = () => {
      if (Number.isFinite(video.duration) && Math.abs(video.duration - (durationSec ?? 0)) > 0.5) fill(video.duration);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();
    video.addEventListener("loadedmetadata", onMetadata);
    return () => video.removeEventListener("loadedmetadata", onMetadata);
  }, [videoRef, script, durationSec]);
}
