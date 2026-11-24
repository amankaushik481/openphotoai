/**
 * Zod schemas for the public API v1 query strings. Shared by the route handlers (parsing) and the
 * OpenAPI document (parameters), so the docs can't drift from what the server accepts.
 *
 * Kept free of database imports so the spec (and the static docs page) stay light;
 * `v1ListJobsQuery` mirrors `listJobsQuery` from src/server/jobs/queries (a unit test asserts both
 * produce the same JSON Schema, and the type assertion below keeps their outputs compatible).
 */
import { z } from "zod";
import type { ListJobsQuery } from "@/server/jobs/queries";
import { JOB_STATUSES, JOB_TYPES } from "@/types/domain";

/** Query-string boolean: "true"/"1" or "false"/"0". */
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const optionalId = z.string().min(1).max(64).optional();

export const v1ListJobsQuery = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  type: z.enum(JOB_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  ids: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50) : undefined)),
});

// Compile-time guard: the v1 query must stay a valid input for listJobsForUser().
type Assignable<T, U extends T> = U;
export type V1ListJobsQuery = Assignable<ListJobsQuery, z.output<typeof v1ListJobsQuery>>;

export const v1ListMediaQuery = z.object({
  folderId: optionalId,
  favorite: flag.optional(),
  kind: z.enum(["image", "video"]).optional(),
  modelId: optionalId,
  packId: z.string().min(1).max(80).optional(),
  batchId: optionalId,
  showHidden: flag.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
});
export type V1ListMediaQuery = z.output<typeof v1ListMediaQuery>;

export const v1CreditsQuery = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
