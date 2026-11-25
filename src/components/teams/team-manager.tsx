"use client";

import { CoinsIcon, ImagesIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCredits } from "@/components/billing/format";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, fetcher } from "@/lib/api-client";
import type { TeamDetailDTO, TeamSummaryDTO } from "@/server/teams/types";
import type { PackOption } from "./brand-kit-editor-dialog";
import { BrandKitsCard } from "./brand-kits-card";
import { CreateTeamForm } from "./create-team-form";
import { CreditTransferDialog } from "./credit-transfer-dialog";
import { MembersCard } from "./members-card";
import { BRAND_KITS_KEY, ROLE_LABELS, teamKey } from "./team-ui";
import { TeamSettingsCard } from "./team-settings-card";

export interface TeamManagerProps {
  initialDetail: TeamDetailDTO;
  /** Every team the user belongs to (for the switcher). */
  teams: TeamSummaryDTO[];
  packs: PackOption[];
  /** The user may still create their own team (Studio plan, owns none). */
  canCreateTeam: boolean;
}

export function TeamManager({ initialDetail, teams, packs, canCreateTeam }: TeamManagerProps) {
  const teamId = initialDetail.team.id;
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, mutate } = useSWR<TeamDetailDTO>(teamKey(teamId), fetcher, {
    fallbackData: initialDetail,
    revalidateOnMount: false,
  });
  const detail = data ?? initialDetail;
  const { team, me } = detail;
  const [transferTo, setTransferTo] = useState<string | null | undefined>(undefined);

  async function refresh() {
    await Promise.all([mutate(), globalMutate(BRAND_KITS_KEY)]);
  }

  const lostAccess = error instanceof ApiClientError && error.status === 404;
  const recipients = detail.members.filter((m) => m.status === "active" && m.role !== "owner" && m.userId);

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title={team.name}
        description={
          <>
            Owned by {me.isOwner ? "you" : team.ownerName} · {team.memberCount}{" "}
            {team.memberCount === 1 ? "member" : "members"} ·{" "}
            <Badge variant={me.role === "member" ? "outline" : "soft"} className="align-middle">
              {ROLE_LABELS[me.role]}
            </Badge>
          </>
        }
        actions={
          <>
            <TeamSwitcher teams={teams} currentId={teamId} canCreate={canCreateTeam} />
            {me.isOwner && (
              <Button variant="brand" onClick={() => setTransferTo(null)}>
                <CoinsIcon aria-hidden="true" />
                Transfer credits
              </Button>
            )}
          </>
        }
      />

      {lostAccess && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>You no longer have access to this team</AlertTitle>
          <AlertDescription>
            <Link href="/app/team" className="underline underline-offset-2">
              Back to your teams
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          <MembersCard detail={detail} onChanged={refresh} onGiveCredits={(userId) => setTransferTo(userId)} />
          <BrandKitsCard teamId={teamId} kits={detail.brandKits} canManage={me.canManage} packs={packs} onChanged={refresh} />
        </div>
        <div className="grid min-w-0 gap-6">
          <CreditsCard isOwner={me.isOwner} ownerName={team.ownerName} onTransfer={() => setTransferTo(null)} />
          <TeamGalleryNote />
          <TeamSettingsCard detail={detail} onChanged={refresh} />
        </div>
      </div>

      {me.isOwner && (
        <CreditTransferDialog
          open={transferTo !== undefined}
          onOpenChange={(open) => !open && setTransferTo(undefined)}
          teamId={teamId}
          teamName={team.name}
          recipients={recipients}
          initialUserId={transferTo}
        />
      )}
    </>
  );
}

function TeamSwitcher({ teams, currentId, canCreate }: { teams: TeamSummaryDTO[]; currentId: string; canCreate: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      {teams.length > 1 && (
        <Select value={currentId} onValueChange={(id) => router.push(`/app/team?team=${encodeURIComponent(id)}`)}>
          <SelectTrigger aria-label="Switch team" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canCreate && (
        <>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <PlusIcon aria-hidden="true" />
            Create your team
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create your own team</DialogTitle>
                <DialogDescription>
                  Your Studio plan lets you own one team with its own brand kits. You stay on this team too.
                </DialogDescription>
              </DialogHeader>
              <CreateTeamForm onCreated={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

function CreditsCard({ isOwner, ownerName, onTransfer }: { isOwner: boolean; ownerName: string; onTransfer: () => void }) {
  const { user } = useMe();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CoinsIcon aria-hidden="true" className="size-4 text-primary" />
          Credits
        </CardTitle>
        <CardDescription>
          {isOwner
            ? "Everyone spends their own balance. Send credits to teammates who need more."
            : `Everyone spends their own balance. ${ownerName || "The team owner"} can send you credits.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Your balance</p>
        <p className="text-2xl font-semibold tabular-nums">{user ? formatCredits(user.credits) : "—"}</p>
      </CardContent>
      {isOwner && (
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={onTransfer}>
            Transfer credits
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function TeamGalleryNote() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagesIcon aria-hidden="true" className="size-4 text-primary" />
          Team gallery
        </CardTitle>
        <CardDescription>
          Photos stay in each person&apos;s private gallery — teammates never see your selfies, models or shots. To
          collect the team&apos;s headshots, ask everyone to share their picks with a link or download them as a zip.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="ghost" className="-ml-2">
          <Link href="/app/gallery">Open my gallery</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
