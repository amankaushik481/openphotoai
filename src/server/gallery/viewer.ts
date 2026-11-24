/** Data for the gallery viewer page (`/app/gallery/[mediaId]`): media, lineage, labels, neighbours. */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, jobs, media } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { AppError } from "@/server/http";
import { getOwnedMedia, toMediaDTO } from "@/server/media/service";
import { getPack } from "@/server/packs/registry";
import type { JobType, MediaDTO } from "@/types/domain";
import { getMediaNeighbors, type MediaFilters } from "./media";

const MAX_CHILDREN = 12;

export interface ViewerData {
  media: MediaDTO;
  parent: MediaDTO | null;
  /** Newer versions derived from this media (edits, upscales, videos…). */
  children: MediaDTO[];
  prevId: string | null;
  nextId: string | null;
  details: {
    modelName: string | null;
    packSlug: string | null;
    packName: string | null;
    batchId: string | null;
    jobType: JobType | null;
    seed: number | null;
  };
}

async function ownedOrNull(userId: string, mediaId: string | null): Promise<MediaRow | null> {
  if (!mediaId) return null;
  try {
    return await getOwnedMedia(userId, mediaId);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") return null;
    throw err;
  }
}

/** Null when the media doesn't exist or isn't the user's (the page renders a 404). */
export async function loadViewerData(userId: string, mediaId: string, filters: MediaFilters): Promise<ViewerData | null> {
  const row = await ownedOrNull(userId, mediaId);
  if (!row) return null;

  const [neighbors, parent, children, model, job, pack] = await Promise.all([
    getMediaNeighbors(userId, row, filters),
    ownedOrNull(userId, row.parentMediaId),
    db
      .select()
      .from(media)
      .where(and(eq(media.userId, userId), eq(media.parentMediaId, row.id), isNull(media.deletedAt), isNull(media.removedAt)))
      .orderBy(desc(media.createdAt))
      .limit(MAX_CHILDREN),
    row.modelId
      ? db
          .select({ name: identityModels.name })
          .from(identityModels)
          .where(and(eq(identityModels.id, row.modelId), eq(identityModels.userId, userId)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    row.jobId
      ? db
          .select({ type: jobs.type })
          .from(jobs)
          .where(and(eq(jobs.id, row.jobId), eq(jobs.userId, userId)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    row.packId ? getPack(row.packId).catch(() => null) : null,
  ]);

  const [mediaDto, parentDto, childDtos] = await Promise.all([
    toMediaDTO(row),
    parent ? toMediaDTO(parent) : null,
    Promise.all(children.map(toMediaDTO)),
  ]);

  return {
    media: mediaDto,
    parent: parentDto,
    children: childDtos,
    prevId: neighbors.prevId,
    nextId: neighbors.nextId,
    details: {
      modelName: model?.name ?? null,
      packSlug: row.packId,
      packName: pack?.name ?? null,
      batchId: row.batchId,
      jobType: job?.type ?? null,
      seed: row.seed,
    },
  };
}
