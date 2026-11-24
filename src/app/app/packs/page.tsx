import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { PackBrowser } from "@/components/create/pack-browser";
import { requireUserPage } from "@/server/auth/session";
import { listPackSummaries } from "@/server/packs/registry";

export const metadata: Metadata = { title: "Photo packs" };

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserPage("/app/packs");
  const [params, packs] = await Promise.all([searchParams, listPackSummaries()]);

  return (
    <>
      <PageHeader
        title="Photo packs"
        description="Pick a theme and get a whole set of photos in one click — headshots, dating, travel and more."
      />
      <PackBrowser packs={packs} initialQuery={one(params.q)?.slice(0, 100)} initialCategory={one(params.category)} />
    </>
  );
}
