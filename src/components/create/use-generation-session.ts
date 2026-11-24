"use client";

import * as React from "react";

import { useErrorToast } from "@/components/create/api-error-alert";
import {
  SESSION_HISTORY_LIMIT,
  fullQualityRequest,
  jobAnnouncement,
  newIdempotencyKey,
  type GenerateRequestBody,
} from "@/components/create/logic";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import type { JobDTO, MediaDTO } from "@/types/domain";

export interface SessionEntry {
  job: JobDTO;
  title: string;
}

/** Per-draft state of a "Full quality" re-render. */
export type RerenderState = "pending" | "started";

/**
 * Jobs started on this page (newest first, local state only), plus the shared actions around them:
 * submit with a fresh Idempotency-Key per click, "Full quality" re-renders and progress announcements.
 */
export function useGenerationSession(opts: { nextPath: string; limit?: number }) {
  const { nextPath, limit = SESSION_HISTORY_LIMIT } = opts;
  const { mutate: refreshMe } = useMe();
  const showError = useErrorToast();
  const [entries, setEntries] = React.useState<SessionEntry[]>([]);
  const [rerenders, setRerenders] = React.useState<Record<string, RerenderState>>({});
  const [announcement, setAnnouncement] = React.useState("");

  /** POST /api/jobs. Throws ApiClientError; callers decide how to show it. */
  const submit = React.useCallback(
    async (body: GenerateRequestBody, title: string): Promise<JobDTO> => {
      const { job } = await api<{ job: JobDTO }>("/api/jobs", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      setEntries((prev) => [{ job, title }, ...prev.filter((e) => e.job.id !== job.id)].slice(0, limit));
      setAnnouncement(jobAnnouncement(job, title));
      void refreshMe();
      return job;
    },
    [limit, refreshMe],
  );

  const fullQuality = React.useCallback(
    async (draft: MediaDTO, job: JobDTO) => {
      const body = fullQualityRequest(draft, job.modelId);
      if (!body) return;
      setRerenders((prev) => ({ ...prev, [draft.id]: "pending" }));
      try {
        await submit(body, "Full-quality re-render");
        setRerenders((prev) => ({ ...prev, [draft.id]: "started" }));
      } catch (err) {
        setRerenders((prev) => {
          const next = { ...prev };
          delete next[draft.id];
          return next;
        });
        showError(err, { nextPath });
      }
    },
    [nextPath, showError, submit],
  );

  /** A job finished: announce it and refresh the balance (refunds land asynchronously). */
  const onTerminal = React.useCallback(
    (job: JobDTO, title: string) => {
      setAnnouncement(jobAnnouncement(job, title));
      void refreshMe();
    },
    [refreshMe],
  );

  const dismiss = React.useCallback((jobId: string) => {
    setEntries((prev) => prev.filter((e) => e.job.id !== jobId));
  }, []);

  const clear = React.useCallback(() => setEntries([]), []);

  return { entries, submit, fullQuality, rerenders, onTerminal, dismiss, clear, announcement, announce: setAnnouncement };
}
