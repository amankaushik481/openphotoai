"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { CoinsIcon, LoaderCircleIcon, RepeatIcon, ShuffleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/app/job-progress";
import { MediaCard } from "@/components/app/media-card";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { useModels } from "@/hooks/use-models";
import { ApiClientError, api, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { creditsLabel, createAgainHref, variationCost, variationRequest } from "./viewer-actions";

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * "Use again" (the create page prefilled with this photo's prompt or pack) and "Make variations"
 * (the same request with a new seed, one click, price on the button). Generated photos only.
 */
export function ViewerRemix({ media }: { media: MediaDTO }) {
  const { data } = useSWR<{ job: JobDTO }>(media.jobId ? `/api/jobs/${media.jobId}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
  const { models } = useModels();
  const { user, mutate: refreshMe } = useMe();
  const [started, setStarted] = React.useState<JobDTO[]>([]);
  const [pending, setPending] = React.useState(false);

  const input = data?.job.input;
  const againHref = createAgainHref(input);
  const request = variationRequest(input);
  const model = models?.find((m) => m.id === (request && "modelId" in request ? request.modelId : null));
  const cost = request ? variationCost(request, model?.mode) : 0;
  const count = request && "numImages" in request ? request.numImages : 1;
  const modelGone = Boolean(models && request && !model);
  const short = user !== undefined && cost > (user?.credits ?? 0);

  if (!againHref && !request) return null;

  async function makeVariations() {
    if (!request || pending) return;
    setPending(true);
    try {
      const { job } = await api<{ job: JobDTO }>("/api/jobs", {
        method: "POST",
        body: request,
        headers: { "Idempotency-Key": idempotencyKey() },
      });
      setStarted((prev) => [job, ...prev]);
      void refreshMe();
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : undefined;
      toast.error(err instanceof ApiClientError ? err.message || errorMessage(code) : errorMessage(undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="viewer-remix" className="flex flex-col gap-2">
      <h2 id="viewer-remix" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        More like this
      </h2>
      <div className="flex flex-wrap gap-2">
        {request && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void makeVariations()}
            disabled={pending || modelGone || short}
            aria-describedby="viewer-remix-cost"
          >
            {pending ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <ShuffleIcon aria-hidden="true" />}
            {count === 1 ? "Make a variation" : `Make ${count} variations`}
            <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
              <CoinsIcon className="size-3" />
              {cost === 0 ? "Free" : cost}
            </span>
          </Button>
        )}
        {againHref && (
          <Button asChild variant="ghost" size="sm">
            <Link href={againHref}>
              <RepeatIcon aria-hidden="true" />
              Use again
            </Link>
          </Button>
        )}
      </div>
      {request && (
        <p id="viewer-remix-cost" className="text-xs text-muted-foreground">
          {modelGone
            ? "The model that made this photo is gone, so variations aren't possible."
            : short
              ? `${creditsLabel(cost)} — you have ${user?.credits ?? 0}. `
              : `Same prompt and settings, new seed · ${creditsLabel(cost)}.`}
          {short && !modelGone && (
            <Link href="/app/billing" className="font-medium text-foreground underline underline-offset-4">
              Buy credits
            </Link>
          )}
        </p>
      )}
      {started.map((job) => (
        <VariationResults key={job.id} initialJob={job} />
      ))}
    </section>
  );
}

function VariationResults({ initialJob }: { initialJob: JobDTO }) {
  const { mutate: refreshMe } = useMe();
  const { job } = useJob(initialJob.id, {
    fallbackJob: initialJob,
    onTerminal: (done) => {
      if (done.status === "succeeded") toast.success(done.media.length === 1 ? "Your variation is ready" : "Your variations are ready");
      if (done.creditsRefunded > 0) void refreshMe();
    },
  });
  const current = job ?? initialJob;
  if (current.status === "succeeded" && current.media.length > 0) {
    return (
      <ul aria-label="Variations" className="grid grid-cols-4 gap-2">
        {current.media.map((m) => (
          <li key={m.id}>
            <MediaCard media={m} href={`/app/gallery/${m.id}`} style={{ aspectRatio: "1 / 1" }} />
          </li>
        ))}
      </ul>
    );
  }
  return <JobProgress job={current} title="Variations" />;
}
