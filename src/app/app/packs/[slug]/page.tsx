import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { PackStudio } from "@/components/create/pack-studio";
import { toPackDetail } from "@/app/api/packs/pack-detail";
import { loadDraftAllowance } from "@/app/app/create/data";
import { requireUserPage } from "@/server/auth/session";
import { getPack } from "@/server/packs/registry";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pack = await getPack((await params).slug);
  return { title: pack ? `${pack.name} pack` : "Pack not found" };
}

export default async function PackPage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUserPage(`/app/packs/${slug}`);
  const pack = await getPack(slug);
  if (!pack) notFound();
  const drafts = await loadDraftAllowance(user);

  return (
    <>
      <Link
        href="/app/packs"
        className="-ml-0.5 mb-4 inline-flex w-fit items-center gap-1.5 rounded-xs py-1 font-mono text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
        All packs
      </Link>
      <PackStudio
        pack={toPackDetail(pack)}
        drafts={drafts}
        plan={user.plan}
      />
    </>
  );
}
