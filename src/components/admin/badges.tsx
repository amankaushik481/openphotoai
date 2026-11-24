import { Badge } from "@/components/ui/badge";
import { getPlan } from "@/config/plans";
import type { JobStatus, PlanId, UserRole } from "@/types/domain";
import { humanize } from "./format";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  queued: "outline",
  running: "soft",
  succeeded: "success",
  failed: "destructive",
  canceled: "secondary",
  blocked: "warning",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={JOB_STATUS_VARIANT[status]}>{humanize(status)}</Badge>;
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  return <Badge variant={plan === "free" ? "outline" : "soft"}>{getPlan(plan).name}</Badge>;
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
      {role === "admin" && <Badge variant="brand">Admin</Badge>}
      {banned && <Badge variant="destructive">Suspended</Badge>}
      {deletedAt && <Badge variant="secondary">Deleted</Badge>}
      {hasPaid && <Badge variant="success">Paid</Badge>}
    </span>
  );
}

const PAYMENT_VARIANT: Record<"paid" | "refunded" | "failed", BadgeVariant> = {
  paid: "success",
  refunded: "warning",
  failed: "destructive",
};

export function PaymentStatusBadge({ status }: { status: "paid" | "refunded" | "failed" }) {
  return <Badge variant={PAYMENT_VARIANT[status]}>{humanize(status)}</Badge>;
}

export function StatusBadge({ value, tone = "outline" }: { value: string; tone?: BadgeVariant }) {
  return <Badge variant={tone}>{humanize(value)}</Badge>;
}
