"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api-client";
import type { MeDTO } from "@/types/domain";

export const ME_KEY = "/api/me";

/** Signed-in user (credits, plan, role). Shared SWR cache: call `mutate()` after spending credits. */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<{ user: MeDTO }>(ME_KEY, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
  return { user: data?.user, error, isLoading, mutate };
}
