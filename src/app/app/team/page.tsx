import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { TeamManager } from "@/components/teams/team-manager";
import { TeamOnboarding } from "@/components/teams/team-onboarding";
import { getPlan } from "@/config/plans";
import { requireUserPage } from "@/server/auth/session";
import { listPackSummaries } from "@/server/packs/registry";
import { getTeamDetail, listMyTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ team?: string | string[] }> }) {
  const user = await requireUserPage("/app/team");
  const [{ team: requested }, teams] = await Promise.all([searchParams, listMyTeams(user.id)]);
  const plan = getPlan(user.plan);
  const canCreateTeam = plan.limits.teamSeats > 0 && !teams.some((t) => t.ownerId === user.id);

  if (teams.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Team"
          title="Brand kits for your whole team"
          description="Give everyone on your team matching headshots: same backdrop, outfit, style and lighting — from their own private model."
        />
        <TeamOnboarding canCreate={canCreateTeam} planName={plan.name} seats={plan.limits.teamSeats} />
      </>
    );
  }

  const selected = teams.find((t) => t.id === requested) ?? teams[0]!;
  const [detail, packs] = await Promise.all([getTeamDetail(user.id, selected.id), listPackSummaries()]);

  return (
    <TeamManager
      key={detail.team.id}
      initialDetail={detail}
      teams={teams}
      packs={packs.map((p) => ({ slug: p.slug, name: p.name }))}
      canCreateTeam={canCreateTeam}
    />
  );
}
