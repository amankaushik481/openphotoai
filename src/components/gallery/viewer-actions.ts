/** Viewer "create from this" helpers: costs, "Use again" links and variation requests (pure; unit-tested). */
import { CREDIT_COSTS, INSTANT_MODE_MULTIPLIER, creditCost } from "@/config/credits";
import type { CreateJobRequest, IdentityModelDTO, JobInput } from "@/types/domain";

/** Starting prices of the tools a photo opens, shown on their buttons before anything is charged. */
export const VIEWER_TOOL_COSTS = {
  /** Instruction edit or brush repaint, per version. */
  edit: Math.min(CREDIT_COSTS.edit, CREDIT_COSTS.inpaint),
  /** 5-second clip (talking videos start at CREDIT_COSTS.talkingVideoPer5s). */
  video: Math.min(CREDIT_COSTS.video5s, CREDIT_COSTS.talkingVideoPer5s),
  tryOn: CREDIT_COSTS.tryOn,
} as const;

/** "2 credits" / "1 credit" / "Free". */
export function creditsLabel(n: number, opts: { from?: boolean } = {}): string {
  if (n <= 0) return "Free";
  const unit = n === 1 ? "credit" : "credits";
  return `${opts.from ? "From " : ""}${n} ${unit}`;
}

type GenerateInput = Extract<JobInput, { type: "generate" }>;

function asGenerate(input: JobInput | null | undefined): GenerateInput | null {
  return input?.type === "generate" ? input : null;
}

/**
 * `/app/create` prefilled with the settings that made this photo (prompt or pack, and the model).
 * Null when the job can't be repeated from the create page (not a generation, or a draft re-render
 * without its own prompt).
 */
export function createAgainHref(input: JobInput | null | undefined): string | null {
  const g = asGenerate(input);
  if (!g) return null;
  const params = new URLSearchParams();
  if (g.packId) {
    params.set("mode", "pack");
    params.set("pack", g.packId);
  } else if (g.prompt?.trim()) {
    params.set("mode", "prompt");
    params.set("prompt", g.prompt.trim());
  } else {
    return null;
  }
  params.set("model", g.modelId);
  return `/app/create?${params.toString()}`;
}

/**
 * The same request with a fresh seed: new takes on the same prompt or pack prompt, aspect ratio,
 * quality and brand kit. Null when there is nothing to vary.
 */
export function variationRequest(input: JobInput | null | undefined): CreateJobRequest | null {
  const g = asGenerate(input);
  if (!g || (!g.prompt?.trim() && !g.packId)) return null;
  const rest: GenerateInput = { ...g, numImages: Math.min(Math.max(g.numImages || 1, 1), 4) };
  delete rest.seed; // a new seed each time
  delete rest.fromDraftMediaId; // a fresh render, not the full-quality copy of one draft
  return rest;
}

/** Credits a variation request costs (Instant models cost more per image, drafts stay free). */
export function variationCost(req: CreateJobRequest, mode: IdentityModelDTO["mode"] | undefined): number {
  const base = creditCost(req);
  const instant = mode === "instant" && req.type === "generate" && req.quality !== "draft";
  return instant ? base * INSTANT_MODE_MULTIPLIER : base;
}
