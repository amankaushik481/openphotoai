"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import type { InviteListDTO, PartnerModelDTO } from "@/server/together/types";
import type { IdentityModelDTO, JobDTO } from "@/types/domain";
import type { PackSummary } from "@/types/pack";
import { InviteFriendCard } from "./invite-friend-card";
import { InvitesPanel } from "./invites-panel";
import { TogetherComposer } from "./together-composer";
import { TogetherResults } from "./together-results";

export interface TogetherStudioProps {
  ownModels: IdentityModelDTO[];
  partnerModels: PartnerModelDTO[];
  invites: InviteListDTO;
  packs: PackSummary[];
}

const INVITE_ANCHOR = "invite-a-friend";

/** /app/together: compose together photos (left) + invites and consent management (right). */
export function TogetherStudio({ ownModels, partnerModels, invites, packs }: TogetherStudioProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [jobs, setJobs] = React.useState<JobDTO[]>([]);
  // Invites, shares and partner models are server-rendered: refresh after every change.
  const refresh = React.useCallback(() => startTransition(() => router.refresh()), [router]);

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Together photos"
        description="Photos of you with a partner, friend or family member — only with their consent."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <TogetherComposer
            ownModels={ownModels}
            partnerModels={partnerModels}
            packs={packs}
            inviteAnchor={INVITE_ANCHOR}
            onJobCreated={(job) => setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])}
          />
          <TogetherResults jobs={jobs} />
        </div>
        <aside aria-label="Invites" className="flex flex-col gap-6 lg:sticky lg:top-6">
          <InviteFriendCard id={INVITE_ANCHOR} onInvited={refresh} />
          <InvitesPanel invites={invites} onChanged={refresh} />
        </aside>
      </div>
    </>
  );
}
