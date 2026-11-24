/** Zod schemas for the admin API (request bodies + query strings). */
import { z } from "zod";
import { JOB_STATUSES, JOB_TYPES } from "@/types/domain";

const id = z.string().trim().min(1).max(64);
const cursor = id.optional();

export const statsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const usersQuery = z.object({
  q: z.string().trim().max(200).optional(),
  cursor,
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const jobsQuery = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  type: z.enum(JOB_TYPES).optional(),
  userId: id.optional(),
  cursor,
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const adjustCreditsBody = z.object({
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, { message: "Adjustment must be non-zero." }),
  note: z.string().trim().min(1, "A note is required.").max(500),
});

export const suspendBody = z.object({
  reason: z.string().trim().min(3, "Give the user a reason.").max(500),
});

export const refundBody = z.object({
  note: z.string().trim().max(500).optional(),
});

export const REPORT_ACTIONS = ["dismiss", "remove_media", "suspend_user"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const resolveReportBody = z.object({
  action: z.enum(REPORT_ACTIONS),
  note: z.string().trim().max(1000).default(""),
});
