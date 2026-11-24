"use client";

import * as React from "react";
import { toast } from "sonner";

import { useJobs } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, api } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import type { CreateJobRequest, JobDTO } from "@/types/domain";

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Friendly text for an API/network error. */
export function apiErrorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message || errorMessage(err.code);
  return errorMessage(undefined);
}

/**
 * POST /api/jobs with an Idempotency-Key (a double click or retry never charges twice), refreshes the credit
 * balance and toasts failures. Resolves to the created job, or null when it failed.
 */
export async function submitJob(input: CreateJobRequest): Promise<JobDTO | null> {
  try {
    const { job } = await api<{ job: JobDTO }>("/api/jobs", {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": idempotencyKey() },
    });
    return job;
  } catch (err) {
    toast.error(apiErrorText(err));
    return null;
  }
}

/**
 * Jobs started on this page (newest first), polled until terminal. The credit balance is refreshed when a job
 * is added and again when all jobs finish (refunds).
 */
export function useSessionJobs() {
  const [seeds, setSeeds] = React.useState<JobDTO[]>([]);
  const ids = React.useMemo(() => seeds.map((j) => j.id), [seeds]);
  const { mutate: refreshMe } = useMe();
  const { jobs: live } = useJobs(ids, { onAllTerminal: () => void refreshMe() });

  const jobs = React.useMemo(() => {
    const byId = new Map(live.map((j) => [j.id, j]));
    return seeds.map((j) => byId.get(j.id) ?? j);
  }, [seeds, live]);

  const add = React.useCallback(
    (job: JobDTO) => {
      setSeeds((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
      void refreshMe();
    },
    [refreshMe],
  );

  return { jobs, add };
}
