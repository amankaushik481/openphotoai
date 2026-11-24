import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { TryOnStudio } from "@/components/try-on/try-on-studio";
import { firstParam } from "@/server/auth/redirect";
import { requireUserPage } from "@/server/auth/session";
import { getOwnedMedia, toMediaDTO } from "@/server/media/service";
import type { MediaDTO } from "@/types/domain";

export const metadata: Metadata = { title: "Virtual try-on" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?mediaId=` preselects one of the user's own photos (anything else is ignored). */
async function loadPerson(userId: string, mediaId: string | undefined): Promise<MediaDTO | null> {
  if (!mediaId || mediaId.length > 64) return null;
  const row = await getOwnedMedia(userId, mediaId).catch(() => null);
  return row?.kind === "image" ? toMediaDTO(row) : null;
}

export default async function TryOnPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage("/app/try-on");
  const mediaId = firstParam((await searchParams).mediaId);
  const initialPerson = await loadPerson(user.id, mediaId);

  return (
    <>
      <PageHeader
        eyebrow="Try-on"
        title="Virtual try-on"
        description="Upload a garment and see it on one of your photos — before you buy."
      />
      <TryOnStudio
        key={initialPerson?.id ?? "none"}
        initialPerson={initialPerson}
        personNotFound={Boolean(mediaId) && !initialPerson}
      />
    </>
  );
}
