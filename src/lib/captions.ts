/**
 * Captions for talking videos, built from the script the voice reads (the video is synthetic speech of a
 * known text). Cue timings are spread over the clip in proportion to each cue's word count, using the
 * real duration when known and the app's speech-rate estimate otherwise.
 */
import { SPEECH_WORDS_PER_SEC } from "@/config/credits";

export interface CaptionCue {
  /** Seconds from the start of the clip. */
  start: number;
  end: number;
  /** One or two lines, joined with "\n". */
  text: string;
}

/** Broadcast-style limits: two lines of about 42 characters per cue. */
const MAX_LINE_CHARS = 42;
const MAX_CUE_CHARS = MAX_LINE_CHARS * 2;

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Greedy word wrap into lines of at most `max` characters (a longer single word gets its own line). */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words(text)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Sentences, then clauses / word runs so no cue exceeds two caption lines. */
function chunks(script: string): string[] {
  const sentences = script
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CUE_CHARS) {
      out.push(sentence);
      continue;
    }
    // Prefer clause breaks; fall back to fixed-width word runs.
    let current = "";
    for (const clause of sentence.split(/(?<=[,;:—–])\s+/)) {
      const candidate = current ? `${current} ${clause}` : clause;
      if (candidate.length <= MAX_CUE_CHARS) {
        current = candidate;
        continue;
      }
      if (current) out.push(current);
      if (clause.length <= MAX_CUE_CHARS) {
        current = clause;
      } else {
        const lines = wrap(clause, MAX_LINE_CHARS);
        for (let i = 0; i < lines.length - 1; i += 2) out.push(lines.slice(i, i + 2).join(" "));
        current = lines.length % 2 === 1 ? lines[lines.length - 1]! : "";
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/**
 * Split a script into timed caption cues.
 * @param durationSec the clip's real duration; when missing or invalid the speech-rate estimate is used.
 */
export function buildCaptionCues(script: string, durationSec?: number | null): CaptionCue[] {
  const parts = chunks(script);
  if (parts.length === 0) return [];
  const counts = parts.map((p) => Math.max(1, words(p).length));
  const totalWords = counts.reduce((a, b) => a + b, 0);
  const total =
    durationSec != null && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : Math.max(1, totalWords / SPEECH_WORDS_PER_SEC);

  const cues: CaptionCue[] = [];
  let elapsedWords = 0;
  parts.forEach((part, i) => {
    const start = (elapsedWords / totalWords) * total;
    elapsedWords += counts[i]!;
    const end = (elapsedWords / totalWords) * total;
    cues.push({ start: round(start), end: round(end), text: wrap(part, MAX_LINE_CHARS).join("\n") });
  });
  return cues;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function timestamp(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** Serialize cues as a WebVTT document (for downloads or a `<track src>`). */
export function toWebVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text.replace(/-->/g, "→")}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
}
