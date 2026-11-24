"use client";

import useSWR, { useSWRConfig } from "swr";
import { MODELS_KEY } from "@/hooks/use-models";
import { api, fetcher } from "@/lib/api-client";
import { LIVENESS_FRAME_FIELD } from "@/lib/liveness";
import type { ConsentChallengeResponse, IdentityMode, ModelDetailResponse, ModelView } from "@/server/models/types";
import type { JobDTO } from "@/types/domain";

export const modelKey = (id: string) => `/api/models/${id}`;

/** Fallback refresh while training: the training card polls the job and revalidates this when it ends. */
const TRAINING_REFRESH_MS = 15_000;

/** GET /api/models/:id (model + photos + readiness). Polls (slowly) while the model is training. */
export function useModel(modelId: string | null | undefined, fallbackData?: ModelDetailResponse) {
  const { data, error, isLoading, mutate } = useSWR<ModelDetailResponse>(modelId ? modelKey(modelId) : null, fetcher, {
    fallbackData,
    revalidateOnFocus: true,
    refreshInterval: (latest) => (latest?.model.status === "training" ? TRAINING_REFRESH_MS : 0),
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
  /** Frontal selfie + one liveness frame per challenge step (in challenge order). */
  consent: (id: string, selfie: Blob, captureToken: string, livenessFrames: readonly Blob[] = []) => {
    const form = new FormData();
    form.append("selfie", selfie, "consent-selfie.jpg");
    livenessFrames.forEach((frame, i) => form.append(LIVENESS_FRAME_FIELD, frame, `liveness-${i + 1}.jpg`));
    form.append("captureToken", captureToken);
    return api<{ model: ModelView }>(`${modelKey(id)}/consent`, { method: "POST", body: form });
  },
  deletePhoto: (id: string, photoId: string) =>
    api<{ ok: true; model: ModelView }>(`${modelKey(id)}/photos/${photoId}`, { method: "DELETE" }),
  train: (id: string, mode: IdentityMode) =>
    api<{ model: ModelView; job: JobDTO | null }>(`${modelKey(id)}/train`, { method: "POST", body: { mode } }),
};
