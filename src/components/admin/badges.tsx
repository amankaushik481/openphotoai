import { Stamp, type StampTone } from "@/components/gallery/readout";
import { getPlan } from "@/config/plans";
import type { JobStatus, PlanId, UserRole } from "@/types/domain";
import { humanize } from "./format";

/**
 * Admin statuses as mono lab stamps. Safelight is reserved for alerts (failures, suspensions, severe
 * reports); everything routine stays ink or muted.
 */
export type BadgeTone = "default" | "outline" | "secondary" | "soft" | "brand" | "success" | "warning" | "destructive";

const TONE: Record<BadgeTone, StampTone> = {
  default: "ink",
  brand: "ink",
  soft: "ink",
  outline: "muted",
  secondary: "muted",
  success: "success",
  warning: "warning",
  destructive: "safelight",
};

const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  queued: "outline",
  running: "soft",
  succeeded: "success",
  failed: "destructive",
  canceled: "secondary",
  blocked: "warning",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Stamp tone={TONE[JOB_STATUS_TONE[status]]}>{humanize(status)}</Stamp>;
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  return <Stamp tone={plan === "free" ? "muted" : "ink"}>{getPlan(plan).name}</Stamp>;
}

export function UserFlags({
  role,
  banned,
  deletedAt,
  hasPaid,
}: {
  role: UserRole;
  banned: boolean;
  deletedAt?: Date | string | null;
  hasPaid?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {role === "admin" && <Stamp tone="ink">Admin</Stamp>}
      {banned && <Stamp tone="safelight">Suspended</Stamp>}
      {deletedAt && <Stamp tone="muted">Deleted</Stamp>}
      {hasPaid && <Stamp tone="success">Paid</Stamp>}
    </span>
  );
}

const PAYMENT_TONE: Record<"paid" | "refunded" | "failed", BadgeTone> = {
  paid: "success",
  refunded: "warning",
  failed: "destructive",
};

export function PaymentStatusBadge({ status }: { status: "paid" | "refunded" | "failed" }) {
  return <Stamp tone={TONE[PAYMENT_TONE[status]]}>{humanize(status)}</Stamp>;
}

export function StatusBadge({ value, tone = "outline" }: { value: string; tone?: BadgeTone }) {
  return <Stamp tone={TONE[tone]}>{humanize(value)}</Stamp>;
}
