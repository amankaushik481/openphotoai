import { LinkIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { JoinTeamButton } from "@/components/teams/join-team-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { requireUserPage } from "@/server/auth/session";
import { getInvitePreview, listMyTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Join a team", robots: { index: false, follow: false } };

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = `/teams/join/${encodeURIComponent(token)}`;
  const user = await requireUserPage(path);
  const invite = await getInvitePreview(token);

  if (!invite) {
    const teams = await listMyTeams(user.id);
    return (
      <AuthShell>
        <Card>
          <CardHeader className="justify-items-center text-center">
            <IconBubble tone="muted">
              <LinkIcon className="size-6" aria-hidden="true" />
            </IconBubble>
            <CardTitle as="h1" className="text-xl">
              This invite link doesn&apos;t work
            </CardTitle>
            <CardDescription>
              It was already used, replaced by a newer invite, or revoked. Ask your team owner to send a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/app/team">{teams.length > 0 ? "Go to your team" : "Go to the app"}</Link>
            </Button>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }

  const alreadyMember = (await listMyTeams(user.id)).some((t) => t.id === invite.teamId);
  const emailMatches = user.email.trim().toLowerCase() === invite.email.toLowerCase();

  return (
    <AuthShell>
      <Card>
        <CardHeader className="justify-items-center text-center">
          <IconBubble tone="brand">
            <UsersIcon className="size-6" aria-hidden="true" />
          </IconBubble>
          <CardTitle as="h1" className="text-xl">
            Join {invite.teamName}
          </CardTitle>
          <CardDescription>
            {invite.inviterName} invited you to {invite.teamName} on {APP.name}. You&apos;ll be able to use the
            team&apos;s brand kits. Your photos and models stay private.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {alreadyMember ? (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-center text-sm">
              You&apos;re already on this team.
            </p>
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
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {alreadyMember ? (
            <Button asChild variant="brand" className="w-full">
              <Link href={`/app/team?team=${encodeURIComponent(invite.teamId)}`}>Open team</Link>
            </Button>
          ) : !emailMatches ? (
            <SignOutButton variant="outline" className="w-full" redirectTo={`/login?next=${encodeURIComponent(path)}`}>
              Switch account
            </SignOutButton>
          ) : (
            <Button asChild variant="ghost" className="w-full">
              <Link href="/app">Not now</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

function IconBubble({ tone, children }: { tone: "brand" | "muted"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "brand"
          ? "mb-2 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
          : "mb-2 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      }
    >
      {children}
    </div>
  );
}
