import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { BatchProgressView } from "@/components/create/batch-progress";
import { AppError } from "@/server/http";
import { requireUserPage } from "@/server/auth/session";
import { getBatchForUser } from "@/server/jobs/batches";
import { getPack, toPackSummary } from "@/server/packs/registry";

export const metadata: Metadata = { title: "Batch" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const user = await requireUserPage(`/app/batches/${id}`);
  const batch = await getBatchForUser(user.id, id).catch((err: unknown) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  const pack = batch.packId ? await getPack(batch.packId) : null;
  const summary = pack ? toPackSummary(pack) : null;
  const rawRequested = (await searchParams).requested;
  const requested = Number(Array.isArray(rawRequested) ? rawRequested[0] : rawRequested);

  return (
    <>
      <Link
        href={summary ? `/app/packs/${summary.slug}` : "/app/packs"}
        className="-ml-1 mb-4 inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        {summary ? summary.name : "Packs"}
      </Link>
      <BatchProgressView
        batchId={batch.id}
        pack={summary ? { slug: summary.slug, name: summary.name, emoji: summary.emoji, colors: summary.colors } : null}
        requested={Number.isInteger(requested) && requested > 0 && requested <= 50 ? requested : undefined}
      />
    </>
  );
}
