/**
 * Zod schemas documenting the public API v1 query strings in the OpenAPI document.
 *
 * Routes parse with the app's own schemas (`listJobsQuery`, `listMediaQuery`) so v1 behaves exactly
 * like the session API. The mirrors below keep the spec module (and the static docs page) free of
 * database/storage imports; tests/unit/api-v1 asserts each mirror produces the same JSON Schema as
 * its source, and the type guards keep their parsed outputs compatible.
 */
import { z } from "zod";
import type { ListMediaQuery } from "@/server/gallery/media";
import type { ListJobsQuery } from "@/server/jobs/queries";
import { JOB_STATUSES, JOB_TYPES } from "@/types/domain";

type Assignable<T, U extends T> = U;

/** Mirror of `listJobsQuery` (src/server/jobs/queries.ts). */
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
export type V1ListJobsQuery = Assignable<ListJobsQuery, z.output<typeof v1ListJobsQuery>>;

const idParam = z.string().trim().min(1).max(80);
/** Query-string boolean: "true"/"1" or "false"/"0". */
const boolParam = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** Mirror of `listMediaQuery` (src/server/gallery/media.ts). */
export const v1ListMediaQuery = z.object({
  folderId: idParam.optional(),
  favorite: boolParam.optional(),
  kind: z.enum(["image", "video"]).optional(),
  modelId: idParam.optional(),
  packId: idParam.optional(),
  batchId: idParam.optional(),
  showHidden: boolParam.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type V1ListMediaQuery = Assignable<ListMediaQuery, z.output<typeof v1ListMediaQuery>>;

/** `GET /models/{id}?mode=`: readiness for the other identity mode. */
export const v1GetModelQuery = z.object({ mode: z.enum(["instant", "trained"]).optional() });

/** Same as the session `GET /api/credits` query. */
export const v1CreditsQuery = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
