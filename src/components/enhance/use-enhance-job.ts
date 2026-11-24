"use client";

import * as React from "react";

import { isTerminalStatus } from "@/hooks/job-status";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { useLocale } from "@/i18n/react";
import { api } from "@/lib/api-client";
import type { CreateJobRequest, JobDTO } from "@/types/domain";
import { enhanceErrorInfo, newIdempotencyKey, type EnhanceErrorInfo } from "./enhance-ui";

export interface UseEnhanceJobOptions {
  onJobCreated?: (job: JobDTO) => void;
  /** Fires once when the started job finishes (succeeded, failed, canceled or blocked). */
  onTerminal?: (job: JobDTO) => void;
  /** Fires when the job couldn't be started (validation, credits, rate limit...). */
  onError?: (error: EnhanceErrorInfo) => void;
}

/**
 * Start one enhancement job (POST /api/jobs with an Idempotency-Key) and follow it until it is
 * terminal. Refreshes the credit balance after charging and after possible refunds.
 */
export function useEnhanceJob({ onJobCreated, onTerminal, onError }: UseEnhanceJobOptions = {}) {
  const locale = useLocale();
  const { mutate: refreshMe } = useMe();
  const [created, setCreated] = React.useState<JobDTO | null>(null);
  const [error, setError] = React.useState<EnhanceErrorInfo | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Guards against a double click landing before the disabled state renders.
  const inFlight = React.useRef(false);

  const callbacks = React.useRef({ onJobCreated, onTerminal, onError });
  React.useEffect(() => {
    callbacks.current = { onJobCreated, onTerminal, onError };
  });

  const { job: polled } = useJob(created?.id, {
    fallbackJob: created ?? undefined,
    onTerminal: (job) => {
      void refreshMe();
      callbacks.current.onTerminal?.(job);
    },
  });
  const job = polled ?? created ?? undefined;
  const running = job ? !isTerminalStatus(job.status) : false;

  const run = React.useCallback(
    async (request: CreateJobRequest): Promise<JobDTO | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const res = await api<{ job: JobDTO }>("/api/jobs", {
          method: "POST",
          body: request,
          headers: { "Idempotency-Key": newIdempotencyKey() },
        });
        setCreated(res.job);
        void refreshMe();
        callbacks.current.onJobCreated?.(res.job);
        return res.job;
      } catch (err) {
        const info = enhanceErrorInfo(err, locale);
        setError(info);
        callbacks.current.onError?.(info);
        return null;
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [locale, refreshMe],
  );

  return { job, error, submitting, busy: submitting || running, run };
}
