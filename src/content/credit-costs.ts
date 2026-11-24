/**
 * Public credit price list, generated from CREDIT_COSTS so the pricing page can never drift from what we charge.
 * `Record<CreditCostKey, …>` makes TypeScript fail the build if a new cost is added without a label.
 */
import { CREDIT_COSTS, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { MODELS } from "@/config/models";
import { CREDIT_PACKS, PAID_PLAN_IDS, PLANS } from "@/config/plans";

export type CreditCostKey = keyof typeof CREDIT_COSTS;

export type CreditCostGroup = "identity" | "photos" | "editing" | "video";

interface CostLabel {
  label: string;
  /** What one charge covers, e.g. "per image". */
  unit: string;
  group: CreditCostGroup;
  note?: string;
}

const LABELS: Record<CreditCostKey, CostLabel> = {
  train: {
    label: "Trained identity model",
    unit: "per model",
    group: "identity",
    note: "Instant models are free to create",
  },
  generateDraft: { label: "Draft preview", unit: "per image", group: "photos", note: "Daily cap applies" },
  generateStandard: { label: "Standard photo", unit: "per image", group: "photos" },
  generateHigh: { label: "High-quality photo", unit: "per image", group: "photos" },
  poseCopy: { label: "Pose copy", unit: "per image", group: "photos" },
  multiPerson: { label: "Together photo (2 people)", unit: "per image", group: "photos" },
  promptHelper: { label: "Prompt helper", unit: "per request", group: "photos" },
  edit: { label: "Edit (outfit, background, hair…)", unit: "per image", group: "editing" },
  inpaint: { label: "Brush edit", unit: "per edit", group: "editing" },
  upscale2x: { label: "Upscale 2×", unit: "per image", group: "editing" },
  upscale4x: { label: "Upscale 4×", unit: "per image", group: "editing" },
  faceRestore: { label: "Face restore", unit: "per image", group: "editing" },
  removeBackground: { label: "Background removal", unit: "per image", group: "editing" },
  tryOn: { label: "Virtual try-on", unit: "per image", group: "editing" },
  video5s: { label: "Photo to video, 5 s", unit: "per clip", group: "video" },
  video10s: { label: "Photo to video, 10 s", unit: "per clip", group: "video" },
  talkingVideoPer5s: { label: "Talking video", unit: "per 5 s of speech", group: "video" },
};

export const CREDIT_COST_GROUPS: { id: CreditCostGroup; title: string }[] = [
  { id: "identity", title: "Identity model" },
  { id: "photos", title: "Photos" },
  { id: "editing", title: "Editing" },
  { id: "video", title: "Video" },
];

export interface CreditCostRow extends CostLabel {
  key: CreditCostKey;
  credits: number;
}

/** One row per CREDIT_COSTS entry, in display order (grouped). */
export function creditCostRows(): CreditCostRow[] {
  const order = CREDIT_COST_GROUPS.map((g) => g.id);
  return (Object.keys(LABELS) as CreditCostKey[])
    .map((key) => ({ key, credits: CREDIT_COSTS[key], ...LABELS[key] }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** "Free" | "1 credit" | "40 credits". */
export function formatCreditCost(credits: number): string {
  if (credits === 0) return "Free";
  return `${credits.toLocaleString("en-US")} credit${credits === 1 ? "" : "s"}`;
}

/** Cheapest and most expensive price of one credit across paid plans and credit packs (USD cents). */
export function creditPriceRangeCents(): { min: number; max: number } {
  const prices = [
    ...PAID_PLAN_IDS.map((id) => PLANS[id].monthlyPriceCents / PLANS[id].monthlyCredits),
    ...PAID_PLAN_IDS.map((id) => PLANS[id].yearlyPriceCents / (PLANS[id].monthlyCredits * 12)),
    ...CREDIT_PACKS.map((p) => p.priceCents / p.credits),
  ].filter((n) => Number.isFinite(n) && n > 0);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** "4.1¢" style label for a fractional cent amount. */
export function formatCents(cents: number): string {
  return `${(Math.round(cents * 10) / 10).toLocaleString("en-US")}¢`;
}

export interface ProviderCostExample {
  label: string;
  credits: number;
  providerUsd: number;
}

/** A few actions with their typical upstream provider cost (default fal.ai models) for the transparency note. */
export function providerCostExamples(): ProviderCostExample[] {
  const fal = MODELS.fal;
  return [
    { label: "Standard photo", credits: CREDIT_COSTS.generateStandard, providerUsd: fal.generate.costUsd },
    {
      label: "Instant-model photo",
      credits: CREDIT_COSTS.generateStandard * INSTANT_MODE_MULTIPLIER,
      providerUsd: fal.editMulti.costUsd,
    },
    { label: "Trained model", credits: CREDIT_COSTS.train, providerUsd: fal.train.costUsd },
    { label: "5 s video", credits: CREDIT_COSTS.video5s, providerUsd: fal.imageToVideo.costUsd },
  ];
}
