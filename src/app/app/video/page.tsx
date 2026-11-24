import type { Metadata } from "next";

import { VideoStudio, type VideoTab } from "@/components/video/video-studio";
import { requireUserPage } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { getOwnedMedia, toMediaDTO } from "@/server/media/service";
import type { MediaDTO } from "@/types/domain";

export const metadata: Metadata = {
  title: "Video",
  description: "Turn your photos into short videos or talking videos.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The `?mediaId=` photo, if the user owns it and it is a still image. */
async function loadSource(userId: string, mediaId: string): Promise<MediaDTO | null> {
  if (!/^[\w-]{1,64}$/.test(mediaId)) return null;
  try {
    const row = await getOwnedMedia(userId, mediaId);
    return row.kind === "image" ? await toMediaDTO(row) : null;
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") return null;
    throw err;
  }
}

export default async function VideoPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage("/app/video");
  const params = await searchParams;
  const mediaId = single(params.mediaId);
  const initialTab: VideoTab = single(params.tab) === "talking" ? "talking" : "photo";
  const initialSource = mediaId ? await loadSource(user.id, mediaId) : null;

  return (
    <VideoStudio initialSource={initialSource} initialTab={initialTab} sourceMissing={Boolean(mediaId) && !initialSource} />
  );
}
