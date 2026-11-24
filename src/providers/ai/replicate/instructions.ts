/**
 * Natural-language instructions for the reference-based image model (google/nano-banana-2). It cannot use LoRA
 * trigger words, so identities are described through numbered reference images instead.
 */
import type { IdentityRef, TryOnInput } from "@/providers/types";

const KEEP_IDENTITY =
  "Keep the person's face, facial features, skin tone, age and body shape exactly as in the reference photos. " +
  "Photorealistic, natural skin texture, everyone fully and appropriately clothed.";

/** "Images 2-4" / "image 2" for 1-based positions [from, to]. */
export function imageRange(from: number, to: number): string {
  return from === to ? `image ${from}` : `images ${from}-${to}`;
}

/** Replace the LoRA trigger phrase ("ohwxabc man" / "ohwxabc") with a plain description of the referenced person. */
export function replaceTriggerPhrase(prompt: string, identity: Pick<IdentityRef, "triggerWord" | "subject">, label: string): string {
  const word = escapeRegExp(identity.triggerWord);
  return prompt
    .replace(new RegExp(`\\b${word}\\s+${escapeRegExp(identity.subject)}\\b`, "gi"), label)
    .replace(new RegExp(`\\b${word}\\b`, "gi"), label)
    .replace(/\s+/g, " ")
    .trim();
}

/** Instant-mode generation: the identity's reference photos (+ optional style reference first). */
export function referenceGenerationPrompt(
  prompt: string,
  identity: Pick<IdentityRef, "triggerWord" | "subject">,
  layout: { styleImage: boolean; identityImages: number },
): string {
  const first = layout.styleImage ? 2 : 1;
  const who = `the ${identity.subject} shown in ${imageRange(first, first + layout.identityImages - 1)}`;
  const scene = replaceTriggerPhrase(prompt, identity, who);
  const style = layout.styleImage ? " Use image 1 only as a reference for composition, pose, setting and lighting; do not copy its person." : "";
  return `Create a new photo: ${scene}.${style} ${KEEP_IDENTITY}`;
}

export function instructEditPrompt(instruction: string): string {
  return (
    `Edit image 1: ${instruction.trim()}. Change only what is asked; keep the person's face, identity, expression, ` +
    "pose, framing and everything else unchanged. Photorealistic result."
  );
}

export function poseCopyPrompt(
  prompt: string,
  identity: Pick<IdentityRef, "triggerWord" | "subject">,
  identityImages: number,
): string {
  const who = `the ${identity.subject} shown in ${imageRange(2, 1 + identityImages)}`;
  const extra = prompt.trim() ? ` ${replaceTriggerPhrase(prompt, identity, who)}.` : "";
  return (
    `Create a new photo of ${who} in the exact pose, body position, camera angle, framing, setting and lighting of image 1. ` +
    `Do not copy the face or identity of anyone in image 1.${extra} ${KEEP_IDENTITY}`
  );
}

export function multiPersonPrompt(
  prompt: string,
  people: { identity: Pick<IdentityRef, "triggerWord" | "subject">; from: number; to: number }[],
): string {
  let scene = prompt;
  const roster = people.map((p, i) => {
    const label = `person ${String.fromCharCode(65 + i)} (the ${p.identity.subject} in ${imageRange(p.from, p.to)})`;
    scene = replaceTriggerPhrase(scene, p.identity, label);
    return label;
  });
  return (
    `Create one new photo showing ${roster.join(" and ")} together: ${scene.trim()}. Each person must keep their own face, ` +
    "facial features, skin tone, age and body shape exactly as in their reference images; do not blend faces. " +
    "Photorealistic, natural skin texture, everyone fully and appropriately clothed."
  );
}

const TRY_ON_TARGET: Record<TryOnInput["category"], string> = {
  auto: "the garment",
  tops: "the top",
  bottoms: "the bottoms (trousers, skirt or shorts)",
  "one-pieces": "the one-piece outfit",
};

export function tryOnPrompt(category: TryOnInput["category"]): string {
  const target = TRY_ON_TARGET[category];
  return (
    `Dress the person in image 1 in ${target} shown in image 2, replacing only the matching clothing they wear. ` +
    "Reproduce the garment's color, pattern, fabric, cut and details faithfully, fitted naturally to their body and pose. " +
    "Keep the person's face, identity, hair, body, pose, the background and lighting exactly as in image 1. Photorealistic."
  );
}

export const DEFAULT_MOTION_PROMPT =
  "subtle natural motion, the person breathes and blinks, gentle smile, slight head movement, soft camera push-in, " +
  "realistic, cinematic";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
