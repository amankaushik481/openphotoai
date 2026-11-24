"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api-client";
import type { IdentityModelDTO } from "@/types/domain";

export const MODELS_KEY = "/api/models";

/** The user's identity models (own + shared with them). */
export function useModels() {
  const { data, error, isLoading, mutate } = useSWR<{ models: IdentityModelDTO[] }>(MODELS_KEY, fetcher, {
    dedupingInterval: 5_000,
  });
  return { models: data?.models, error, isLoading, mutate };
}
