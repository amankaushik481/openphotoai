/**
 * Client-safe mirror of how generation applies a brand kit (src/server/jobs/brand-kits.ts
 * `brandKitPrompt`): the kit's fields are trimmed, stripped of trailing punctuation and
 * appended to the prompt with ", ". A unit test keeps the two in sync.
 */
export interface BrandKitPromptFields {
  backgroundPrompt: string;
  outfitPrompt: string;
  stylePrompt: string;
  lighting: string;
}

export function brandKitFragment(kit: BrandKitPromptFields): string {
  return [kit.backgroundPrompt, kit.outfitPrompt, kit.stylePrompt, kit.lighting]
    .map((s) => s.trim().replace(/[.,;\s]+$/, ""))
    .filter(Boolean)
    .join(", ");
}

/** The prompt a generation would use with this kit applied. */
export function applyBrandKitToPrompt(prompt: string, kit: BrandKitPromptFields): string {
  const fragment = brandKitFragment(kit);
  return fragment ? `${prompt}, ${fragment}` : prompt;
}

/** Example base prompt shown in the editor's live preview. */
export const SAMPLE_HEADSHOT_PROMPT = "professional headshot of you, looking at the camera, sharp focus";
