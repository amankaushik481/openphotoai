/**
 * Public (client-safe) view of a pack: its summary plus shot titles. The prompt templates stay
 * server-side — they are the product, and exposing them would invite prompt-injection probing.
 */
import "server-only";
import type { PackDetail } from "@/components/create/logic";
import { toPackSummary } from "@/server/packs/registry";
import type { Pack } from "@/types/pack";

export function toPackDetail(pack: Pack): PackDetail {
  return {
    ...toPackSummary(pack),
    defaultAspectRatio: pack.defaultAspectRatio,
    prompts: pack.prompts.map((p) => ({ title: p.title })),
  };
}

/** Packs only change on deploy: let browsers/CDNs cache briefly and revalidate in the background. */
export const PACKS_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
