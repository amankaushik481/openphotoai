"use client";

import useSWR, { useSWRConfig } from "swr";
import { MODELS_KEY } from "@/hooks/use-models";
import { api, fetcher } from "@/lib/api-client";
import type { ConsentChallengeResponse, IdentityMode, ModelDetailResponse, ModelView } from "@/server/models/types";
import type { JobDTO } from "@/types/domain";

export const modelKey = (id: string) => `/api/models/${id}`;

/** GET /api/models/:id (model + photos + readiness). Polls while the model is training. */
export function useModel(modelId: string | null | undefined, fallbackData?: ModelDetailResponse) {
  const { data, error, isLoading, mutate } = useSWR<ModelDetailResponse>(modelId ? modelKey(modelId) : null, fetcher, {
    fallbackData,
    revalidateOnFocus: true,
    refreshInterval: (latest) => (latest?.model.status === "training" ? 5_000 : 0),
  });
  return { detail: data, error, isLoading, mutate };
}

/** Revalidate the models list (dashboard, pickers) after a change. */
export function useRefreshModels() {
  const { mutate } = useSWRConfig();
  return () => mutate(MODELS_KEY);
}

export const modelsApi = {
  create: (body: { name: string; subject: string }) => api<{ model: ModelView }>("/api/models", { method: "POST", body }),
  rename: (id: string, name: string) => api<{ model: ModelView }>(modelKey(id), { method: "PATCH", body: { name } }),
  remove: (id: string) => api<{ ok: true }>(modelKey(id), { method: "DELETE" }),
  challenge: (id: string) => api<ConsentChallengeResponse>(`${modelKey(id)}/consent/challenge`, { method: "POST" }),
  consent: (id: string, selfie: Blob, captureToken: string) => {
    const form = new FormData();
    form.append("selfie", selfie, "consent-selfie.jpg");
    form.append("captureToken", captureToken);
    return api<{ model: ModelView }>(`${modelKey(id)}/consent`, { method: "POST", body: form });
  },
  deletePhoto: (id: string, photoId: string) =>
    api<{ ok: true; model: ModelView }>(`${modelKey(id)}/photos/${photoId}`, { method: "DELETE" }),
  train: (id: string, mode: IdentityMode) =>
    api<{ model: ModelView; job: JobDTO | null }>(`${modelKey(id)}/train`, { method: "POST", body: { mode } }),
};
