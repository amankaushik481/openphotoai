"use client";

import { CircleCheckIcon, CircleDotIcon, LightbulbIcon, LockIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { ReadinessDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { POSE_GOALS, POSE_LABELS } from "./photo-issues";

export interface ReadinessPanelProps {
  readiness: ReadinessDTO;
  /** Readiness for Instant mode, shown as a secondary milestone (wizard). */
  instant?: ReadinessDTO;
  /** Show blockers and tips (default true). Off once a trained model no longer needs its photos. */
  guidance?: boolean;
  className?: string;
}

/** Counts, progress toward the minimum, head-pose variety meter, blockers and tips. */
export function ReadinessPanel({ readiness, instant, guidance = true, className }: ReadinessPanelProps) {
  const { accepted, minRequired, maxAllowed } = readiness;
  const pct = Math.min(100, Math.round((accepted / Math.max(1, minRequired)) * 100));

  return (
    <section aria-labelledby="readiness-title" className={cn("flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="readiness-title" className="font-semibold whitespace-nowrap">
            Training set
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{accepted}</span> good · {readiness.rejected} can&apos;t use · max{" "}
            {maxAllowed}
          </p>
        </div>
        <Progress
          value={pct}
          aria-label={`${accepted} of ${minRequired} photos needed`}
          indicatorClassName={cn(readiness.canTrain ? "bg-success" : "bg-brand-gradient")}
        />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {instant && <Milestone done={instant.accepted >= instant.minRequired} label={`Instant: ${instant.minRequired}+ photos`} />}
          <Milestone done={accepted >= minRequired} label={`${instant ? "Trained" : "Ready"}: ${minRequired}+ photos`} />
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Pose variety</h3>
        <ul className="grid grid-cols-5 gap-1.5" aria-label="Accepted photos by head pose">
          {(Object.keys(POSE_GOALS) as (keyof typeof POSE_GOALS)[]).map((bucket) => {
            const count = readiness.variety[bucket];
            const goal = POSE_GOALS[bucket];
            const fill = Math.min(1, count / goal);
            return (
              <li key={bucket} className="flex flex-col items-center gap-1 text-center">
                <div
                  className="relative h-12 w-full overflow-hidden rounded-md bg-muted"
                  role="img"
                  aria-label={`${POSE_LABELS[bucket]}: ${count} of ${goal} suggested`}
                >
                  <div
                    className={cn("absolute inset-x-0 bottom-0 transition-[height]", fill >= 1 ? "bg-success/70" : "bg-primary/50")}
                    style={{ height: `${Math.max(count > 0 ? 12 : 0, fill * 100)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{count}</span>
                </div>
                <span className="text-[11px] leading-tight text-muted-foreground">{POSE_LABELS[bucket]}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {guidance && readiness.blockers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">Before you can continue</h3>
          <ul className="flex flex-col gap-1.5">
            {readiness.blockers.map((b) => (
              <li key={b} className="flex gap-2 text-sm">
                <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {guidance && readiness.tips.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">Tips</h3>
          <ul className="flex flex-col gap-1.5">
            {readiness.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-sm text-muted-foreground">
                <LightbulbIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Milestone({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5", done ? "text-success" : "text-muted-foreground")}>
      {done ? <CircleCheckIcon aria-hidden="true" className="size-4" /> : <CircleDotIcon aria-hidden="true" className="size-4" />}
      <span>
        {label}
        <span className="sr-only">{done ? " (reached)" : " (not yet)"}</span>
      </span>
    </li>
  );
}
