import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImagesIcon, VideoOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { EditStudio, type EditTab } from "@/components/edit/edit-studio";
import { requireUserPage } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { getOwnedMedia, toMediaDTO } from "@/server/media/service";
import type { MediaDTO } from "@/types/domain";

export const metadata: Metadata = {
  title: "Edit photo",
  description: "Change the outfit, background, hair or expression of your photo, repaint details or enhance it.",
};

type Params = Promise<{ mediaId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?tab=` values (incl. the aliases other pages link with) → editor tab. */
const TAB_ALIASES: Record<string, EditTab> = {
  edit: "edit",
  brush: "brush",
  inpaint: "brush",
  enhance: "enhance",
  upscale: "enhance",
  restore: "enhance",
  bg: "enhance",
};

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The user's own (generated) media, or null. Edits never operate on other users' media (DECISIONS.md #11). */
async function loadMedia(userId: string, mediaId: string): Promise<MediaDTO | null> {
  if (!/^[\w-]{1,64}$/.test(mediaId)) return null;
  try {
    return await toMediaDTO(await getOwnedMedia(userId, mediaId));
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") return null;
    throw err;
  }
}

export default async function EditPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ mediaId }, query] = await Promise.all([params, searchParams]);
  const user = await requireUserPage(`/app/edit/${mediaId}`);
  const media = await loadMedia(user.id, mediaId);
  if (!media) notFound();

  const tab = single(query.tab);
  const initialTab: EditTab = tab && Object.hasOwn(TAB_ALIASES, tab) ? TAB_ALIASES[tab]! : "edit";

  return (
    <>
      <PageHeader
        back={{ href: `/app/gallery/${media.id}`, label: "Back to photo" }}
        title="Edit photo"
        description="Change what you want, keep the rest. Your face stays yours."
      />
      {media.kind === "image" ? (
        <EditStudio key={media.id} media={media} initialTab={initialTab} />
      ) : (
        <EmptyState
          icon={<VideoOffIcon />}
          title="Videos can't be edited"
          description="The editor works on photos. Pick a photo from your gallery to edit it."
          action={
            <Button asChild variant="brand">
              <Link href="/app/gallery">
                <ImagesIcon />
                Open gallery
              </Link>
            </Button>
          }
        />
      )}
    </>
  );
}
