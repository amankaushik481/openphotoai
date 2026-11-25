import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { PrintSheet } from "@/components/auth/print-sheet";
import { SheetKicker, SheetTitle } from "@/components/auth/sheet-heading";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { JoinTeamButton } from "@/components/teams/join-team-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { requireUserPage } from "@/server/auth/session";
import { getInvitePreview, listMyTeams, TEAM_INVITE_TTL_DAYS } from "@/server/teams";

export const metadata: Metadata = { title: "Join a team", robots: { index: false, follow: false } };

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = `/teams/join/${encodeURIComponent(token)}`;
  const user = await requireUserPage(path);
  const invite = await getInvitePreview(token);

  if (!invite) {
    const teams = await listMyTeams(user.id);
    return (
      <AuthShell label="Team invite">
        <PrintSheet frame="07" mark="reject" caption="Team invite">
          <SheetKicker tone="warning">Link not on file</SheetKicker>
          <SheetTitle>This invite link doesn&apos;t work</SheetTitle>
          <p className="mt-3 text-sm text-muted-foreground">
            It was already used, replaced by a newer invite, or revoked. Ask your team owner to send a new one.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full rounded-[3px]">
            <Link href="/app/team">{teams.length > 0 ? "Go to your team" : "Go to the app"}</Link>
          </Button>
        </PrintSheet>
      </AuthShell>
    );
  }

  const alreadyMember = (await listMyTeams(user.id)).some((t) => t.id === invite.teamId);

  if (invite.expired && !alreadyMember) {
    return (
      <AuthShell label="Team invite">
        <PrintSheet frame="07" mark="reject" caption={`Team invite · ${TEAM_INVITE_TTL_DAYS}-day link`}>
          <SheetKicker tone="warning">Past its date</SheetKicker>
          <SheetTitle>This invite has expired</SheetTitle>
          <p className="mt-3 text-sm text-muted-foreground">
            Invite links to {invite.teamName} work for {TEAM_INVITE_TTL_DAYS} days. Ask {invite.inviterName} to send you
            a new one from their Team page; the new link arrives at {invite.email}.
          </p>
          <Button asChild variant="outline" className="mt-6 w-full rounded-[3px]">
            <Link href="/app">Go to the app</Link>
          </Button>
        </PrintSheet>
      </AuthShell>
    );
  }
  const emailMatches = user.email.trim().toLowerCase() === invite.email.toLowerCase();

  return (
    <AuthShell label="Team invite">
      <PrintSheet frame="07" caption="Team invite">
        <SheetKicker tone="safelight">From {invite.inviterName}</SheetKicker>
        <SheetTitle>Join {invite.teamName}</SheetTitle>
        <p className="mt-3 text-sm text-muted-foreground">
          {invite.inviterName} invited you to {invite.teamName} on {APP.name}. You&apos;ll be able to use the
          team&apos;s brand kits. Your photos and models stay private.
        </p>
        <div className="mt-6 grid gap-3">
          {alreadyMember ? (
            <p className="border-l-2 border-foreground py-1 pl-3 text-sm">You&apos;re already on this team.</p>
          ) : !emailMatches ? (
            <Alert variant="warning">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>
                This invite was sent to <strong className="font-medium text-foreground">{invite.email}</strong>, but
                you&apos;re signed in as <strong className="font-medium text-foreground">{user.email}</strong>. Sign in
                with the invited address to join.
              </AlertDescription>
            </Alert>
          ) : (
            <JoinTeamButton token={token} teamName={invite.teamName} />
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {alreadyMember ? (
            <Button asChild variant="brand" className="w-full rounded-[3px]">
              <Link href={`/app/team?team=${encodeURIComponent(invite.teamId)}`}>Open team</Link>
            </Button>
          ) : !emailMatches ? (
            <SignOutButton
              variant="outline"
              className="w-full rounded-[3px]"
              redirectTo={`/login?next=${encodeURIComponent(path)}`}
            >
              Switch account
            </SignOutButton>
          ) : (
            <Button asChild variant="ghost" className="w-full rounded-[3px]">
              <Link href="/app">Not now</Link>
            </Button>
          )}
        </div>
      </PrintSheet>
    </AuthShell>
  );
}
