/** What switching from one plan to another means for the user (pure, client-safe). */
import { getPlan } from "@/config/plans";
import type { PlanId } from "@/types/domain";

const ORDER: PlanId[] = ["free", "starter", "pro", "studio"];

export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return ORDER.indexOf(to) > ORDER.indexOf(from);
}

/** Features the user loses by moving from `from` to `to` (empty for upgrades). */
export function lostFeatures(from: PlanId, to: PlanId): string[] {
  const a = getPlan(from).limits;
  const b = getPlan(to).limits;
  const lost: string[] = [];
  if (a.apiAccess && !b.apiAccess) lost.push("API access: your API keys stop working.");
  if (a.teamSeats > 0 && b.teamSeats === 0) lost.push("Team seats: your team can't invite anyone new.");
  if (b.maxModels < a.maxModels) {
    lost.push(`Identity models: up to ${b.maxModels} instead of ${a.maxModels}. Existing models stay.`);
  }
  if (b.maxBatch < a.maxBatch) lost.push(`Batches: up to ${b.maxBatch} photos per click instead of ${a.maxBatch}.`);
  if (b.maxConcurrentJobs < a.maxConcurrentJobs) {
    lost.push(`Speed: ${b.maxConcurrentJobs} jobs at a time instead of ${a.maxConcurrentJobs}.`);
  }
  return lost;
}
