/**
 * Pack registry: reads + validates packs/*.json (cached). CONTRACT FILE (owner: packs workstream).
 */
import type { AspectRatio, Subject } from "@/types/domain";
import type { Pack, PackSummary } from "@/types/pack";

export async function listPacks(): Promise<Pack[]> {
  throw new Error("not implemented: listPacks (packs)");
}

export async function listPackSummaries(): Promise<PackSummary[]> {
  throw new Error("not implemented: listPackSummaries (packs)");
}

export async function getPack(slug: string): Promise<Pack | null> {
  void slug;
  throw new Error("not implemented: getPack (packs)");
}

/**
 * Expand prompt `index` (mod prompt count) of a pack for an identity.
 * Returns the final prompt (containing the trigger word) + negative prompt + aspect ratio.
 */
export function renderPackPrompt(
  pack: Pack,
  index: number,
  identity: { triggerWord: string; subject: Subject },
): { prompt: string; negativePrompt?: string; aspectRatio: AspectRatio; title: string } {
  void pack;
  void index;
  void identity;
  throw new Error("not implemented: renderPackPrompt (packs)");
}

/** Expand placeholders in a free-form user prompt; prepends the subject token if missing. */
export function renderFreePrompt(prompt: string, identity: { triggerWord: string; subject: Subject }): string {
  void prompt;
  void identity;
  throw new Error("not implemented: renderFreePrompt (packs)");
}
