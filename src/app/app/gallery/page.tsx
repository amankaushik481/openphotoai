import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { GalleryView } from "@/components/gallery/gallery-view";
import { MediaGrid } from "@/components/app/media-grid";
import { t } from "@/i18n";
import { requireUserPage } from "@/server/auth/session";
import { listPackSummaries } from "@/server/packs/registry";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage() {
  await requireUserPage("/app/gallery");
  const packs = (await listPackSummaries()).map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <>
      <PageHeader
        title={t("nav.gallery")}
        description="Your photos and videos. Favorite, organize into folders, share or download in bulk."
        actions={
          <Button asChild variant="brand">
            <Link href="/app/create">
              <SparklesIcon aria-hidden="true" />
              {t("nav.create")}
            </Link>
          </Button>
        }
      />
      {/* useSearchParams() in the client view needs a Suspense boundary. */}
      <Suspense fallback={<MediaGrid media={[]} loading skeletonCount={12} />}>
        <GalleryView packs={packs} />
      </Suspense>
    </>
  );
}
