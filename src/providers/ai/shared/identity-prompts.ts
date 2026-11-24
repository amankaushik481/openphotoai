/**
 * Instruction templates for reference-based image models (Nano Banana style multi-image editors), shared by
 * AI adapters. Every template tells the model which input image is which, preserves the person's identity and
 * restricts the change to what was asked. Trigger words only mean something to the user's LoRA, so they are
 * replaced with plain descriptions here.
 */
import type { IdentityRef } from "@/providers/types";
import type { Subject } from "@/types/domain";

/** Reference photos used per person (enough for likeness, well under Nano Banana's 14-image limit). */
export const MAX_IDENTITY_REFS = 4;
/** Instant mode has no LoRA, so it leans on more reference photos. */
export const MAX_INSTANT_REFS = 8;
export const MAX_REFERENCE_IMAGES = 14;

const SAFE_OUTPUT = "Everyone is an adult, fully and appropriately clothed; tasteful and natural; no text, logos or watermarks.";
const IDENTITY_TRAITS = "face shape, facial features, eye colour, skin tone, hairline, age and body type";

export function subjectNoun(subject: Subject): string {
  return subject;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the prompt already mentions the trigger word as a whole word. */
export function containsTrigger(prompt: string, triggerWord: string): boolean {
  const trigger = triggerWord.trim();
  return trigger.length > 0 && new RegExp(`\\b${escapeRegExp(trigger)}\\b`, "i").test(prompt);
}

/**
 * Replace the identity's trigger word (and a directly following "man"/"woman"/"person") with `replacement`,
 * e.g. "photo of ohwx man on a yacht" -> "photo of the man on a yacht".
 */
export function replaceTrigger(prompt: string, identity: Pick<IdentityRef, "triggerWord">, replacement: string): string {
  const trigger = identity.triggerWord.trim();
  let out = prompt.replaceAll("{subject}", replacement);
  if (trigger) {
    const re = new RegExp(`\\b${escapeRegExp(trigger)}\\b(?:\\s+(?:man|woman|person))?`, "gi");
    out = out.replace(re, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** "image 3" / "images 2-4" (1-based positions). */
export function imageRange(start: number, count: number): string {
  return count <= 1 ? `image ${start}` : `images ${start}-${start + count - 1}`;
}

/** Instant-mode generation: the identity comes only from reference photos (images 1..refCount). */
export function instantGeneratePrompt(args: {
  prompt: string;
  identity: Pick<IdentityRef, "triggerWord" | "subject">;
  refCount: number;
  /** Position of an optional style/composition reference image (1-based), placed after the identity refs. */
  styleRefIndex?: number;
}): string {
  const noun = subjectNoun(args.identity.subject);
  const refs = imageRange(1, args.refCount);
  const scene = replaceTrigger(args.prompt, args.identity, `the ${noun}`);
  const lines = [
    `Create a new photorealistic photograph of the ${noun} shown in the reference photos (${refs}).`,
    `Keep their identity exactly: same ${IDENTITY_TRAITS}. It must be unmistakably the same ${noun}.`,
    "Do not copy the reference photos' clothing, background or pose unless the description asks for it.",
  ];
  if (args.styleRefIndex) {
    lines.push(
      `Image ${args.styleRefIndex} is only a style and composition reference: borrow its framing, lighting and mood, never the face or identity of anyone in it.`,
    );
  }
  lines.push(`Description: ${scene}`, `The ${noun} is the main subject. ${SAFE_OUTPUT}`);
  return lines.join("\n");
}

/** Instruction edit of image 1; identity refs (if any) follow it, then extra references. */
export function instructEditPrompt(args: {
  instruction: string;
  identity?: Pick<IdentityRef, "triggerWord" | "subject">;
  identityRefCount: number;
  extraRefCount: number;
}): string {
  const noun = args.identity ? subjectNoun(args.identity.subject) : "person";
  const instruction = args.identity ? replaceTrigger(args.instruction, args.identity, `the ${noun}`) : args.instruction.trim();
  const lines = [
    `Edit image 1: ${instruction}`,
    "Change only what this instruction asks for and keep everything else in image 1 the same: " +
      `the ${noun}'s identity (${IDENTITY_TRAITS}), pose, framing, camera angle, lighting and background, unless the instruction explicitly changes them.`,
  ];
  let next = 2;
  if (args.identityRefCount > 0) {
    lines.push(
      `${capitalize(imageRange(next, args.identityRefCount))} ${args.identityRefCount > 1 ? "are" : "is"} extra reference photos of the same ${noun}; use them only to keep the face accurate.`,
    );
    next += args.identityRefCount;
  }
  if (args.extraRefCount > 0) {
    lines.push(`${capitalize(imageRange(next, args.extraRefCount))}: reference for the requested change only; never take a face from it.`);
  }
  lines.push(`The result must look like an unedited, photorealistic photograph. ${SAFE_OUTPUT}`);
  return lines.join("\n");
}

/** Pose copy: image 1 is the pose/scene reference, images 2.. show the person to depict. */
export function poseCopyPrompt(args: {
  prompt?: string;
  identity: Pick<IdentityRef, "triggerWord" | "subject">;
  identityRefCount: number;
}): string {
  const noun = subjectNoun(args.identity.subject);
  const refs = imageRange(2, args.identityRefCount);
  const lines = [
    `Image 1 is a pose and scene reference. ${capitalize(refs)} show the ${noun} to photograph.`,
    `Create a new photorealistic photo of the ${noun} from ${refs} in the same pose, body position, framing, camera angle, setting and lighting as image 1.`,
    `Take the face, hair, skin tone and body type only from ${refs} and keep that identity exactly (${IDENTITY_TRAITS}). ` +
      "Do not keep any facial features of the person in image 1.",
  ];
  const extra = args.prompt?.trim() ? replaceTrigger(args.prompt, args.identity, `the ${noun}`) : "";
  if (extra) lines.push(`Additional direction: ${extra}`);
  lines.push(`Only one person in the photo. ${SAFE_OUTPUT}`);
  return lines.join("\n");
}

export interface MultiPersonSlot {
  identity: Pick<IdentityRef, "triggerWord" | "subject">;
  start: number;
  count: number;
}

/** Two (or more) identities in one scene; each person's refs are a contiguous block of images. */
export function multiPersonPrompt(args: { prompt: string; people: MultiPersonSlot[]; sceneRefIndex?: number }): string {
  const labels = args.people.map((_, i) => `person ${String.fromCharCode(65 + i)}`);
  const lines = args.people.map(
    (p, i) => `${capitalize(imageRange(p.start, p.count))} show ${labels[i]} (an adult ${subjectNoun(p.identity.subject)}).`,
  );
  let scene = args.prompt;
  args.people.forEach((p, i) => {
    scene = replaceTrigger(scene, p.identity, labels[i]!);
  });
  const together = labels.length === 2 ? `${labels[0]} and ${labels[1]}` : labels.join(", ");
  lines.push(
    `Create one new photorealistic photo of ${together} together: ${scene}`,
    `Each person keeps their own identity exactly (${IDENTITY_TRAITS}); never blend, average or swap their faces.`,
  );
  if (args.sceneRefIndex) {
    lines.push(`Image ${args.sceneRefIndex} is only a scene and composition reference; never take a face from it.`);
  }
  lines.push(`Show exactly these ${labels.length} people as the subjects, with no other recognizable faces. ${SAFE_OUTPUT}`);
  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
