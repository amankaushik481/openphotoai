/**
 * Pure options + helpers for photo-to-video and talking videos. No React and no server imports, so the
 * UI and the job handlers (src/server/jobs/handlers/{video,talking-video}.ts) share one source of truth.
 */
import { creditCost, estimateSpeechSeconds, SPEECH_WORDS_PER_SEC } from "@/config/credits";
import type { CreateJobRequest, VOICES } from "@/types/domain";

export type Voice = (typeof VOICES)[number];
export type VideoDuration = 5 | 10;
export type VideoJobRequest = Extract<CreateJobRequest, { type: "video" }>;
export type TalkingVideoJobRequest = Extract<CreateJobRequest, { type: "talking_video" }>;

/** Motion prompt used when the user leaves it blank. */
export const DEFAULT_MOTION_PROMPT = "subtle natural motion, gentle camera push-in, realistic";
/** Longest talking video we make, in estimated seconds of speech. */
export const MAX_TALKING_SECONDS = 60;
/** Word budget that fits in MAX_TALKING_SECONDS at the estimator's speaking rate. */
export const MAX_TALKING_WORDS = Math.floor(MAX_TALKING_SECONDS * SPEECH_WORDS_PER_SEC);
/** Mirrors the request schema limits in src/types/domain.ts. */
export const MAX_MOTION_PROMPT_CHARS = 800;
export const MAX_SCRIPT_CHARS = 600;
export const MIN_SCRIPT_CHARS = 2;

export const VIDEO_DURATIONS: readonly VideoDuration[] = [5, 10];

export interface MotionPreset {
  id: string;
  label: string;
  /** Phrase appended to the motion prompt. */
  phrase: string;
}

export const MOTION_PRESETS: readonly MotionPreset[] = [
  { id: "smile", label: "Slow smile", phrase: "slowly breaks into a warm, natural smile" },
  { id: "hair", label: "Hair in the wind", phrase: "hair gently moving in a soft breeze" },
  { id: "turn", label: "Turn to camera", phrase: "slowly turns to look into the camera" },
  { id: "blink", label: "Blink & breathe", phrase: "natural blinking and subtle breathing" },
  { id: "laugh", label: "Soft laugh", phrase: "laughs softly in a candid moment" },
  { id: "push", label: "Camera push-in", phrase: "slow cinematic camera push-in" },
  { id: "orbit", label: "Camera orbit", phrase: "camera slowly orbits around the subject" },
];

export interface VoiceOption {
  label: string;
  description: string;
}

export const VOICE_OPTIONS: Record<Voice, VoiceOption> = {
  neutral: { label: "Neutral", description: "Clear and balanced — works for any message." },
  warm_female: { label: "Warm (female)", description: "Friendly and relaxed, like talking to a friend." },
  bright_female: { label: "Bright (female)", description: "Upbeat and energetic — great for announcements." },
  calm_male: { label: "Calm (male)", description: "Steady and reassuring, for explainers and intros." },
  deep_male: { label: "Deep (male)", description: "Rich and low, for a confident, polished tone." },
};

/** Display order in the voice picker. */
export const VOICE_ORDER: readonly Voice[] = ["neutral", "warm_female", "bright_female", "calm_male", "deep_male"];

/** Credits for a photo-to-video clip. */
export function videoCredits(durationSec: VideoDuration): number {
  return creditCost({ type: "video", sourceMediaId: "-", durationSec });
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface ScriptStats {
  words: number;
  /** Estimated seconds of speech (0 for an empty script). */
  seconds: number;
  credits: number;
  tooLong: boolean;
  tooShort: boolean;
}

/** Live numbers for the script editor; mirrors the server's checks and pricing. */
export function scriptStats(script: string): ScriptStats {
  const trimmed = script.trim();
  const words = countWords(trimmed);
  const seconds = words === 0 ? 0 : estimateSpeechSeconds(trimmed);
  return {
    words,
    seconds,
    credits: creditCost({ type: "talking_video", sourceMediaId: "-", script: trimmed || "-", voice: "neutral" }),
    tooLong: seconds > MAX_TALKING_SECONDS,
    tooShort: trimmed.length < MIN_SCRIPT_CHARS,
  };
}

function segments(prompt: string): string[] {
  return prompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const norm = (s: string) => s.trim().toLowerCase();

/** True when `phrase` is one of the comma-separated parts of `prompt`. */
export function hasPresetPhrase(prompt: string, phrase: string): boolean {
  return segments(prompt).some((s) => norm(s) === norm(phrase));
}

/**
 * Add `phrase` to the end of a comma-separated motion prompt, or remove it if already present.
 * Adding is skipped when it would exceed the prompt length limit.
 */
export function togglePresetPhrase(prompt: string, phrase: string, maxLength = MAX_MOTION_PROMPT_CHARS): string {
  const parts = segments(prompt);
  if (parts.some((s) => norm(s) === norm(phrase))) {
    return parts.filter((s) => norm(s) !== norm(phrase)).join(", ");
  }
  const next = [...parts, phrase.trim()].join(", ");
  return next.length > maxLength ? prompt : next;
}

/** Body for POST /api/jobs (blank prompt -> server default motion). */
export function buildVideoRequest(args: {
  sourceMediaId: string;
  prompt: string;
  durationSec: VideoDuration;
}): VideoJobRequest {
  const prompt = args.prompt.trim();
  return {
    type: "video",
    sourceMediaId: args.sourceMediaId,
    durationSec: args.durationSec,
    ...(prompt ? { prompt } : {}),
  };
}

export function buildTalkingVideoRequest(args: {
  sourceMediaId: string;
  script: string;
  voice: Voice;
}): TalkingVideoJobRequest {
  return { type: "talking_video", sourceMediaId: args.sourceMediaId, script: args.script.trim(), voice: args.voice };
}
