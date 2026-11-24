/**
 * Media lineage checks shared by the video handlers (SAF-12): walk `parentMediaId` back through the
 * jobs that produced a photo to find out whether it descends from a Together (multi_person) photo.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { errors } from "@/server/http";

/** How far up the edit chain (edit of an edit of ...) we look for a Together photo. */
const MAX_LINEAGE_HOPS = 8;

/**
 * Talking videos put words in someone's mouth, so they are only made from photos of the user alone.
 * The other person in a Together photo consented to photos, not to speaking. Checks the source and
 * the photos it was edited from.
 */
export async function assertSoloSource(
  userId: string,
  source: MediaRow,
  message = "Talking videos can only be made from photos of you alone, not Together photos.",
): Promise<void> {
  let current: { jobId: string | null; parentMediaId: string | null } | undefined = source;
  for (let hop = 0; current && hop < MAX_LINEAGE_HOPS; hop++) {
    if (current.jobId) {
      const [job] = await db
        .select({ type: jobs.type })
        .from(jobs)
        .where(and(eq(jobs.id, current.jobId), eq(jobs.userId, userId)))
        .limit(1);
      if (job?.type === "multi_person") {
        throw errors.validation(message);
      }
    }
    if (!current.parentMediaId) return;
    [current] = await db
      .select({ jobId: media.jobId, parentMediaId: media.parentMediaId })
      .from(media)
      .where(and(eq(media.id, current.parentMediaId), eq(media.userId, userId)))
      .limit(1);
  }
}
